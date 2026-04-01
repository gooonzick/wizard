import {
	WizardAbortError,
	WizardConfigurationError,
	WizardNavigationError,
	WizardValidationError,
} from "../errors";
import type {
	StepId,
	ValidationResult,
	WizardContext,
	WizardData,
} from "../types/base";
import type { WizardDefinition } from "../types/definition";
import type { StepStatus, WizardStepDefinition } from "../types/step";
import { resolveStepInDirection } from "./step-resolver";
import { evaluateGuard } from "./transitions";
import { alwaysValid } from "./validators";

/**
 * Current state of the wizard
 */
export interface WizardState<T> {
	currentStepId: StepId;
	data: T;
	isValid: boolean;
	isCompleted: boolean;
	canGoBack: boolean;
	validationErrors?: Record<string, string>;
	stepStatuses: Record<StepId, StepStatus>;
}

/**
 * Events emitted by the wizard machine
 */
export interface WizardEvents<T> {
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onValidation?: (result: ValidationResult) => void;
	onSubmit?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onError?: (error: Error) => void;
}

/**
 * Options for the goTo() navigation method
 */
export interface GoToOptions {
	/** Skip validation of the current step before leaving (default: false) */
	skipValidation?: boolean;
	/** Skip checking the enabled guard on the target step (default: false) */
	skipGuards?: boolean;
	/** Skip onLeave/onEnter lifecycle hooks (default: false) */
	skipLifecycle?: boolean;
}

/**
 * Runtime state machine for wizard execution
 */
export class WizardMachine<T extends WizardData> {
	private definition: WizardDefinition<T>;
	private context: WizardContext;
	private state: WizardState<T>;
	private events: WizardEvents<T>;
	private visitedSteps: Set<StepId> = new Set();
	private stepHistory: StepId[] = [];
	private isTransitioning = false;

	constructor(
		definition: WizardDefinition<T>,
		context: WizardContext,
		initialData: T,
		events?: WizardEvents<T>,
	) {
		this.definition = definition;
		this.context = context;
		this.events = events || {};

		if (!definition.steps[definition.initialStepId]) {
			throw new WizardConfigurationError(
				`Initial step "${definition.initialStepId}" not found`,
			);
		}

		this.state = {
			currentStepId: definition.initialStepId,
			data:
				typeof structuredClone === "function"
					? structuredClone(initialData)
					: JSON.parse(JSON.stringify(initialData)),
			isValid: true,
			isCompleted: false,
			canGoBack: false,
			stepStatuses: this.initializeStepStatuses(),
		};
		this.visitedSteps.add(definition.initialStepId);
		this.stepHistory.push(definition.initialStepId);

		// Fire onStepEnter for initial step (async, non-blocking)
		this.initializeFirstStep();
	}

	/**
	 * Initializes the first step by calling lifecycle hooks
	 */
	private async initializeFirstStep(): Promise<void> {
		const initialStep = this.definition.steps[this.definition.initialStepId];
		try {
			if (initialStep.onEnter) {
				await initialStep.onEnter(this.state.data, this.context);
			}
			this.events.onStepEnter?.(this.definition.initialStepId, this.state.data);
			this.debug(`Entered initial step: ${this.definition.initialStepId}`);
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	 * Builds the initial stepStatuses map.
	 * All steps start as "pristine", except the active step ("active")
	 * and steps with a static `enabled: false` ("skipped").
	 * @param activeStepId The step to mark as "active" (defaults to initialStepId)
	 */
	private initializeStepStatuses(
		activeStepId?: StepId,
	): Record<StepId, StepStatus> {
		const active = activeStepId ?? this.definition.initialStepId;
		const statuses: Record<StepId, StepStatus> = {};
		for (const [stepId, step] of Object.entries(this.definition.steps)) {
			if (step.enabled === false) {
				statuses[stepId] = "skipped";
			} else if (stepId === active) {
				statuses[stepId] = "active";
			} else {
				statuses[stepId] = "pristine";
			}
		}
		return statuses;
	}

	/**
	 * Gets the current step definition
	 */
	get currentStep(): WizardStepDefinition<T> {
		return this.definition.steps[this.state.currentStepId];
	}

	/**
	 * Gets the current state snapshot
	 */
	get snapshot(): WizardState<T> {
		return { ...this.state };
	}

	/**
	 * Gets the list of visited steps
	 */
	get visited(): StepId[] {
		return Array.from(this.visitedSteps);
	}

	/**
	 * Gets the navigation history (ordered list of steps visited)
	 */
	get history(): StepId[] {
		return [...this.stepHistory];
	}

	/**
	 * Checks if navigation is currently in progress
	 */
	get isBusy(): boolean {
		return this.isTransitioning;
	}

	/**
	 * Updates wizard data
	 */
	updateData(updater: (data: T) => T): void {
		const newData = updater(this.state.data);
		const newStatuses = this.recalculateSkippedStatuses();
		this.state = {
			...this.state,
			data: newData,
			stepStatuses: newStatuses,
		};
		this.notifyStateChange();
	}

	/**
	 * Sets wizard data directly
	 */
	setData(data: T): void {
		const newStatuses = this.recalculateSkippedStatuses();
		this.state = {
			...this.state,
			data,
			stepStatuses: newStatuses,
		};
		this.notifyStateChange();
	}

	/**
	 * Validates current step
	 */
	async validate(): Promise<ValidationResult> {
		this.checkAborted();
		try {
			const step = this.currentStep;
			const validator = step.validate || alwaysValid;

			const result = await validator(this.state.data, this.context);

			this.state = {
				...this.state,
				isValid: result.valid,
				validationErrors: result.errors,
			};

			this.events.onValidation?.(result);
			this.notifyStateChange();

			return result;
		} catch (error) {
			this.handleError(error);
			return { valid: false, errors: { general: "Validation error occurred" } };
		}
	}

	/**
	 * Checks if the wizard can be submitted (validates and checks if last step)
	 */
	async canSubmit(): Promise<boolean> {
		if (this.state.isCompleted) {
			return false;
		}
		const validation = await this.validate();
		const nextStep = await this.resolveNextStep();
		return validation.valid && !nextStep;
	}

	/**
	 * Gets the resolved next step ID (public accessor)
	 */
	async getNextStepId(): Promise<StepId | null> {
		return this.resolveNextStep();
	}

	/**
	 * Gets the resolved previous step ID (public accessor)
	 */
	async getPreviousStepId(): Promise<StepId | null> {
		return this.resolvePreviousStep();
	}

	/**
	 * Submits current step
	 */
	async submit(): Promise<void> {
		this.checkAborted();
		if (this.state.isCompleted) {
			throw new WizardNavigationError("Wizard is already completed");
		}

		try {
			const step = this.currentStep;

			// Validate before submit
			const validationResult = await this.validate();
			if (!validationResult.valid) {
				throw new WizardValidationError(validationResult.errors || {});
			}

			// Execute step's submit handler
			if (step.onSubmit) {
				await step.onSubmit(this.state.data, this.context);
				this.events.onSubmit?.(step.id, this.state.data);
			}

			// Check if this is the last step
			const nextStepId = await this.resolveNextStep();
			if (!nextStepId) {
				await this.complete();
			}
		} catch (error) {
			this.handleError(error);
			throw error;
		}
	}

	/**
	 * Goes to next step
	 */
	async goNext(): Promise<void> {
		return this.withTransition(async () => {
			if (this.state.isCompleted) {
				throw new WizardNavigationError("Wizard is already completed");
			}

			// Validate current step
			const validationResult = await this.validate();
			if (!validationResult.valid) {
				this.setStepStatusInternal(this.state.currentStepId, "error");
				throw new WizardValidationError(validationResult.errors || {});
			}

			// Submit current step
			const currentStep = this.currentStep;
			if (currentStep.onSubmit) {
				await currentStep.onSubmit(this.state.data, this.context);
				this.events.onSubmit?.(currentStep.id, this.state.data);
			}

			// Mark current step as completed before navigating
			this.setStepStatusInternal(this.state.currentStepId, "completed");

			// Resolve next step
			const nextStepId = await this.resolveNextStep();
			if (!nextStepId) {
				// No next step - we're at the end
				await this.complete();
				return;
			}

			// Navigate to next step
			await this.navigateToStep(nextStepId);
			this.debug(`Navigated to next step: ${nextStepId}`);
		});
	}

	/**
	 * Goes to previous step.
	 * Uses navigation history stack when available (pops the current step),
	 * falls back to the previous transition resolver when history is empty.
	 */
	async goPrevious(): Promise<void> {
		return this.withTransition(async () => {
			// History-first: if we have history entries beyond the current step, pop back
			if (this.stepHistory.length > 1) {
				// Pop the current step off the stack
				this.stepHistory.pop();
				// The new top is our target
				const previousStepId = this.stepHistory[this.stepHistory.length - 1];

				this.setStepStatusInternal(this.state.currentStepId, "visited");
				await this.navigateToStep(previousStepId, { pushToHistory: false });
				this.debug(
					`Navigated to previous step (from history): ${previousStepId}`,
				);
				return;
			}

			// Fallback: use transition resolver when history is empty
			const previousStepId = await this.resolvePreviousStep();
			if (!previousStepId) {
				throw new WizardNavigationError("No previous step available");
			}

			this.setStepStatusInternal(this.state.currentStepId, "visited");
			await this.navigateToStep(previousStepId);
			this.debug(
				`Navigated to previous step (from resolver): ${previousStepId}`,
			);
		});
	}

	/**
	 * Goes back a specified number of steps in history.
	 * @param steps Number of steps to go back (default: 1)
	 * @deprecated Use `goPrevious()` instead, which now uses the navigation history stack.
	 * `goBack(1)` is equivalent to `goPrevious()`. For multiple steps, call `goPrevious()` repeatedly.
	 */
	async goBack(steps = 1): Promise<void> {
		return this.withTransition(async () => {
			if (this.stepHistory.length - 1 < steps) {
				throw new WizardNavigationError(
					`Cannot go back ${steps} steps, only ${this.stepHistory.length - 1} steps in history`,
				);
			}

			// Pop `steps` entries from the stack
			for (let i = 0; i < steps; i++) {
				this.stepHistory.pop();
			}

			const targetStepId = this.stepHistory[this.stepHistory.length - 1];

			// Check if target step is still enabled
			const targetStep = this.definition.steps[targetStepId];
			if (!targetStep) {
				throw new WizardNavigationError(
					`Step "${targetStepId}" not found`,
					targetStepId,
					"not-found",
				);
			}

			const isEnabled = await evaluateGuard(
				targetStep.enabled,
				this.state.data,
				this.context,
			);

			if (!isEnabled) {
				throw new WizardNavigationError(
					`Step "${targetStepId}" is no longer enabled`,
					targetStepId,
					"disabled",
				);
			}

			await this.navigateToStep(targetStepId, { pushToHistory: false });
			this.debug(`Went back ${steps} steps to: ${targetStepId}`);
		});
	}

	/**
	 * Navigates to a specific step with options to control validation, guards, and lifecycle.
	 * @param stepId Target step ID
	 * @param options Navigation options
	 * @throws WizardNavigationError if step not found or disabled (when skipGuards is false)
	 * @throws WizardValidationError if current step is invalid (when skipValidation is false)
	 */
	async goTo(stepId: StepId, options?: GoToOptions): Promise<void> {
		const {
			skipValidation = false,
			skipGuards = false,
			skipLifecycle = false,
		} = options ?? {};

		return this.withTransition(async () => {
			if (this.state.isCompleted) {
				throw new WizardNavigationError("Wizard is already completed");
			}

			const targetStep = this.definition.steps[stepId];
			if (!targetStep) {
				throw new WizardNavigationError(
					`Step "${stepId}" not found`,
					stepId,
					"not-found",
				);
			}

			// No-op if already on the target step
			if (this.state.currentStepId === stepId) {
				return;
			}

			// Validate current step before leaving (unless skipped)
			if (!skipValidation) {
				const validationResult = await this.validate();
				if (!validationResult.valid) {
					throw new WizardValidationError(validationResult.errors || {});
				}
			}

			// Check if target step is enabled (unless skipped)
			if (!skipGuards) {
				const isEnabled = await evaluateGuard(
					targetStep.enabled,
					this.state.data,
					this.context,
				);

				if (!isEnabled) {
					throw new WizardNavigationError(
						`Step "${stepId}" is not enabled`,
						stepId,
						"disabled",
					);
				}
			}

			this.setStepStatusInternal(this.state.currentStepId, "visited");
			await this.navigateToStep(stepId, { skipLifecycle });
			this.debug(`Navigated to step: ${stepId}`);
		});
	}

	/**
	 * Jumps directly to a specific step (if enabled)
	 * @deprecated Use `goTo(stepId)` instead. Will be removed in next major version.
	 * Note: goToStep skips validation (unlike goTo which validates by default).
	 */
	async goToStep(stepId: StepId): Promise<void> {
		return this.goTo(stepId, { skipValidation: true });
	}

	/**
	 * Checks if a specific step can be navigated to
	 */
	async canNavigateToStep(stepId: StepId): Promise<boolean> {
		const step = this.definition.steps[stepId];
		if (!step) {
			return false;
		}

		return evaluateGuard(step.enabled, this.state.data, this.context);
	}

	/**
	 * Gets all available steps
	 */
	async getAvailableSteps(): Promise<StepId[]> {
		const available: StepId[] = [];

		for (const [stepId, step] of Object.entries(this.definition.steps)) {
			const isEnabled = await evaluateGuard(
				step.enabled,
				this.state.data,
				this.context,
			);
			if (isEnabled) {
				available.push(stepId);
			}
		}

		return available;
	}

	/**
	 * Resolves the next step ID (with infinite loop protection)
	 */
	private async resolveNextStep(): Promise<StepId | null> {
		return resolveStepInDirection(
			this.currentStep,
			this.definition.steps,
			this.state.data,
			this.context,
			{
				direction: "next",
				getTransition: (step) => step.next,
				getNextTransition: (step) => step.next,
			},
		);
	}

	/**
	 * Resolves the previous step ID (with infinite loop protection)
	 */
	private async resolvePreviousStep(): Promise<StepId | null> {
		return resolveStepInDirection(
			this.currentStep,
			this.definition.steps,
			this.state.data,
			this.context,
			{
				direction: "previous",
				getTransition: (step) => step.previous,
				getNextTransition: (step) => step.previous,
			},
		);
	}

	/**
	 * Navigates to a specific step
	 * @param stepId Target step ID
	 * @param options.pushToHistory Whether to push the target step onto the history stack (default: true).
	 *   Set to false when navigating backward (the target is already in the stack).
	 */
	private async navigateToStep(
		stepId: StepId,
		options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
	): Promise<void> {
		const { pushToHistory = true, skipLifecycle = false } = options ?? {};
		const currentStep = this.currentStep;
		const targetStep = this.definition.steps[stepId];

		// Call onLeave for current step
		if (!skipLifecycle) {
			if (currentStep.onLeave) {
				await currentStep.onLeave(this.state.data, this.context);
			}
			this.events.onStepLeave?.(currentStep.id, this.state.data);
		}

		// Update history stack
		if (pushToHistory) {
			this.stepHistory.push(stepId);
		}

		// Update state
		this.state = {
			...this.state,
			currentStepId: stepId,
			isValid: true,
			validationErrors: undefined,
			canGoBack: this.stepHistory.length > 1,
			stepStatuses: {
				...this.state.stepStatuses,
				[stepId]: "active",
			},
		};

		this.visitedSteps.add(stepId);

		// Call onEnter for new step
		if (!skipLifecycle) {
			if (targetStep.onEnter) {
				await targetStep.onEnter(this.state.data, this.context);
			}
			this.events.onStepEnter?.(stepId, this.state.data);
		}

		this.notifyStateChange();
	}

	/**
	 * Clears the navigation history stack, keeping only the current step.
	 * Resets all step statuses to their initial values.
	 * Useful for reset/cancel scenarios.
	 */
	clearHistory(): void {
		this.stepHistory = [this.state.currentStepId];
		this.state = {
			...this.state,
			canGoBack: false,
			stepStatuses: this.initializeStepStatuses(this.state.currentStepId),
		};
		this.notifyStateChange();
	}

	/**
	 * Completes the wizard (called internally when reaching end)
	 */
	private async complete(): Promise<void> {
		if (this.state.isCompleted) {
			return;
		}

		this.state = {
			...this.state,
			isCompleted: true,
		};

		if (this.definition.onComplete) {
			await this.definition.onComplete(this.state.data, this.context);
		}
		this.events.onComplete?.(this.state.data);
		this.debug("Wizard completed");
		this.notifyStateChange();
	}

	/**
	 * Ensures navigation is not already in progress
	 */
	private ensureNotBusy(): void {
		if (this.isTransitioning) {
			throw new WizardNavigationError(
				"Navigation already in progress",
				undefined,
				"busy",
			);
		}
	}

	/**
	 * Checks if operation was aborted via context signal
	 */
	private checkAborted(): void {
		if (this.context.signal?.aborted) {
			throw new WizardAbortError();
		}
	}

	/**
	 * Notifies about state change
	 */
	private notifyStateChange(): void {
		this.events.onStateChange?.(this.snapshot);
	}

	/**
	 * Updates a step's status in the internal state without emitting a change.
	 * Used by navigation methods that will emit their own state change afterward.
	 */
	private setStepStatusInternal(stepId: StepId, status: StepStatus): void {
		this.state = {
			...this.state,
			stepStatuses: {
				...this.state.stepStatuses,
				[stepId]: status,
			},
		};
	}

	/**
	 * Recalculates skipped statuses based on static boolean `enabled` guards.
	 * Function guards are deferred to navigation time to keep data updates synchronous.
	 */
	private recalculateSkippedStatuses(): Record<StepId, StepStatus> {
		const current = this.state.stepStatuses;
		let changed = false;
		const updated: Record<StepId, StepStatus> = { ...current };

		for (const [stepId, step] of Object.entries(this.definition.steps)) {
			if (typeof step.enabled !== "boolean") {
				continue;
			}
			const shouldBeSkipped = !step.enabled;
			if (shouldBeSkipped && current[stepId] !== "skipped") {
				updated[stepId] = "skipped";
				changed = true;
			} else if (!shouldBeSkipped && current[stepId] === "skipped") {
				updated[stepId] = "pristine";
				changed = true;
			}
		}

		return changed ? updated : current;
	}

	/**
	 * Gets the status of a specific step
	 */
	getStepStatus(stepId: StepId): StepStatus {
		return this.state.stepStatuses[stepId];
	}

	/**
	 * Manually overrides the status of a specific step.
	 * Emits an onStateChange event.
	 */
	setStepStatus(stepId: StepId, status: StepStatus): void {
		if (!this.definition.steps[stepId]) {
			throw new WizardNavigationError(
				`Step "${stepId}" not found`,
				stepId,
				"not-found",
			);
		}
		this.setStepStatusInternal(stepId, status);
		this.notifyStateChange();
	}

	/**
	 * Logs debug message if debug mode is enabled
	 */
	private debug(message: string): void {
		if (this.context.debug) {
			console.log(`[WizardMachine] ${message}`);
		}
	}

	/**
	 * Handles errors
	 */
	private handleError(error: unknown): void {
		const err = error instanceof Error ? error : new Error(String(error));
		this.events.onError?.(err);
	}

	/**
	 * Helper to wrap navigation operations with proper state management
	 * @param operation Async operation to execute
	 * @returns Result of the operation
	 * @throws Error from operation after calling handleError
	 */
	private async withTransition<R>(operation: () => Promise<R>): Promise<R> {
		this.checkAborted();
		this.ensureNotBusy();

		this.isTransitioning = true;
		try {
			return await operation();
		} catch (error) {
			this.handleError(error);
			throw error;
		} finally {
			this.isTransitioning = false;
		}
	}
}
