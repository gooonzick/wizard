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
import type { WizardStepDefinition } from "../types/step";
import { evaluateGuard } from "./transitions";
import { resolveStepInDirection } from "./step-resolver";
import { alwaysValid } from "./validators";

/**
 * Current state of the wizard
 */
export interface WizardState<T> {
	currentStepId: StepId;
	data: T;
	isValid: boolean;
	isCompleted: boolean;
	validationErrors?: Record<string, string>;
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
		this.state = {
			...this.state,
			data: updater(this.state.data),
		};
		this.notifyStateChange();
	}

	/**
	 * Sets wizard data directly
	 */
	setData(data: T): void {
		this.state = {
			...this.state,
			data,
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
				throw new WizardValidationError(validationResult.errors || {});
			}

			// Submit current step
			const currentStep = this.currentStep;
			if (currentStep.onSubmit) {
				await currentStep.onSubmit(this.state.data, this.context);
				this.events.onSubmit?.(currentStep.id, this.state.data);
			}

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
	 * Goes to previous step
	 */
	async goPrevious(): Promise<void> {
		return this.withTransition(async () => {
			const previousStepId = await this.resolvePreviousStep();
			if (!previousStepId) {
				throw new WizardNavigationError("No previous step available");
			}

			await this.navigateToStep(previousStepId);
			this.debug(`Navigated to previous step: ${previousStepId}`);
		});
	}

	/**
	 * Goes back a specified number of steps in history
	 * @param steps Number of steps to go back (default: 1)
	 */
	async goBack(steps = 1): Promise<void> {
		return this.withTransition(async () => {
			const currentIndex = this.stepHistory.lastIndexOf(
				this.state.currentStepId,
			);
			const targetIndex = currentIndex - steps;

			if (targetIndex < 0) {
				throw new WizardNavigationError(
					`Cannot go back ${steps} steps, only ${currentIndex} steps in history`,
				);
			}

			const targetStepId = this.stepHistory[targetIndex];

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

			await this.navigateToStep(targetStepId);
			this.debug(`Went back ${steps} steps to: ${targetStepId}`);
		});
	}

	/**
	 * Jumps directly to a specific step (if enabled)
	 */
	async goToStep(stepId: StepId): Promise<void> {
		return this.withTransition(async () => {
			const targetStep = this.definition.steps[stepId];
			if (!targetStep) {
				throw new WizardNavigationError(
					`Step "${stepId}" not found`,
					stepId,
					"not-found",
				);
			}

			// Check if step is enabled
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

			await this.navigateToStep(stepId);
			this.debug(`Jumped to step: ${stepId}`);
		});
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
	 */
	private async navigateToStep(stepId: StepId): Promise<void> {
		const currentStep = this.currentStep;
		const targetStep = this.definition.steps[stepId];

		// Call onLeave for current step
		if (currentStep.onLeave) {
			await currentStep.onLeave(this.state.data, this.context);
		}
		this.events.onStepLeave?.(currentStep.id, this.state.data);

		// Update state
		this.state = {
			...this.state,
			currentStepId: stepId,
			isValid: true,
			validationErrors: undefined,
		};

		this.visitedSteps.add(stepId);
		this.stepHistory.push(stepId);

		// Call onEnter for new step
		if (targetStep.onEnter) {
			await targetStep.onEnter(this.state.data, this.context);
		}
		this.events.onStepEnter?.(stepId, this.state.data);

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
	private async withTransition<R>(
		operation: () => Promise<R>,
	): Promise<R> {
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
