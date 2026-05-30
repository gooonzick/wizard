import {
	WizardAbortError,
	WizardConfigurationError,
	WizardNavigationError,
	WizardRestoreError,
	WizardValidationError,
} from "../errors";
import { PluginHost } from "../plugins/plugin-host";
import type {
	DeepReadonly,
	ErrorContext,
	WizardMachineReadonly,
	WizardPlugin,
} from "../plugins/types";
import type {
	StepId,
	ValidationResult,
	WizardContext,
	WizardData,
} from "../types/base";
import type { WizardDefinition } from "../types/definition";
import type {
	StepStatus,
	WizardProgress,
	WizardStepDefinition,
} from "../types/step";
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
	progress: WizardProgress;
}

/**
 * JSON-safe serialized wizard runtime state
 */
export interface WizardSerializedState<T extends WizardData> {
	version: 1;
	currentStepId: StepId;
	data: T;
	isValid: boolean;
	isCompleted: boolean;
	validationErrors?: Record<string, string>;
	stepStatuses: Record<StepId, StepStatus>;
	visitedSteps: StepId[];
	history: StepId[];
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
	/** Fired by `cancel()` before the machine is reset. May be async. */
	onCancel?: (data: T) => void | Promise<void>;
	/** Fired after `reset()` (and after `cancel()`'s implicit reset). */
	onReset?: () => void;
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
const SERIALIZED_STATE_VERSION = 1;

const VALID_STEP_STATUSES = new Set<StepStatus>([
	"pristine",
	"active",
	"visited",
	"completed",
	"error",
	"skipped",
]);

export class WizardMachine<T extends WizardData> {
	private definition: WizardDefinition<T>;
	private context: WizardContext;
	private _state!: Omit<WizardState<T>, "progress">;
	private events: WizardEvents<T>;
	private visitedSteps: Set<StepId> = new Set();
	private stepHistory: StepId[] = [];
	private isTransitioning = false;
	/** Abort token for reset()/cancel(): bumped to supersede in-flight transitions. */
	private generation = 0;
	/** Generation captured at the start of the active withTransition operation. */
	private transitionGen: number | undefined;
	/** Bumped on every state mutation; used to invalidate the cached progress. */
	private stateVersion = 0;
	private cachedProgress: WizardProgress | null = null;
	private cachedProgressVersion = -1;
	/** Deep-cloned snapshot of the data used to seed `reset()`. */
	private initialData: T;
	// WIZ-007: plugin host and the read-only facade passed to plugin hooks.
	private pluginHost!: PluginHost<T>;
	private readonlyFacade!: WizardMachineReadonly<T>;

	/**
	 * @param plugins Optional plugins to register at construction time.
	 *   Each plugin's `onInit` is dispatched fire-and-forget and may run
	 *   concurrently with the initial step's `onEnter` — plugins must not
	 *   assume `onInit` has completed before their first hook fires.
	 */
	constructor(
		definition: WizardDefinition<T>,
		context: WizardContext,
		initialData: T,
		events?: WizardEvents<T>,
		plugins?: WizardPlugin<T>[],
	) {
		this.definition = definition;
		this.context = context;
		this.events = events || {};

		if (!definition.steps[definition.initialStepId]) {
			throw new WizardConfigurationError(
				`Initial step "${definition.initialStepId}" not found`,
			);
		}

		this.initialData = this.cloneData(initialData);
		this.state = {
			currentStepId: definition.initialStepId,
			data: this.cloneData(initialData),
			isValid: true,
			isCompleted: false,
			canGoBack: false,
			stepStatuses: this.initializeStepStatuses(),
		};
		this.visitedSteps.add(definition.initialStepId);
		this.stepHistory.push(definition.initialStepId);

		// WIZ-007: plugin host + readonly facade. The host's error reporter routes
		// isolated hook throws through handleError (phase defaults to "transition").
		this.pluginHost = new PluginHost<T>((err) => this.handleError(err));
		// Object literal getters cannot use the outer `this`, so capture it in
		// `machineRef`.
		const machineRef = this;
		this.readonlyFacade = {
			get snapshot() {
				// `snapshot` returns a frozen `WizardState<T>` which is structurally
				// compatible with `DeepReadonly<WizardState<T>>` at runtime, but the
				// compiler cannot verify that the freeze satisfies every nested readonly
				// constraint, so we use a double cast rather than `as never`.
				return machineRef.snapshot as unknown as DeepReadonly<WizardState<T>>;
			},
			get currentStep() {
				// Same structural-readonly mismatch as `snapshot` above.
				return machineRef.currentStep as unknown as DeepReadonly<
					WizardStepDefinition<T>
				>;
			},
			getStepStatus: (stepId) => this.getStepStatus(stepId),
		};
		// Register constructor plugins in array order.
		if (plugins) {
			for (const plugin of plugins) {
				this.pluginHost.add(plugin);
			}
		}

		// Fire onStepEnter for initial step (async, non-blocking)
		this.initializeFirstStep();

		// WIZ-007: fire onInit for constructor plugins (fire-and-forget) right
		// after initial state seeding.
		this.pluginHost.dispatchInit(this.readonlyFacade);
	}

	/**
	 * Internal state accessor. Writing bumps the state version so the cached
	 * progress (FIX 10) is invalidated on every state mutation.
	 */
	private get state(): Omit<WizardState<T>, "progress"> {
		return this._state;
	}

	private set state(next: Omit<WizardState<T>, "progress">) {
		this._state = next;
		this.stateVersion++;
	}

	/**
	 * Deep-clones data for snapshotting. Uses `structuredClone` when available,
	 * falls back to JSON round-trip otherwise.
	 */
	private cloneData(data: T): T {
		return typeof structuredClone === "function"
			? structuredClone(data)
			: JSON.parse(JSON.stringify(data));
	}

	/**
	 * Initializes the first step by calling lifecycle hooks
	 */
	private async initializeFirstStep(): Promise<void> {
		// FIX 2: capture the generation so a stale re-enter from a superseded
		// reset()/cancel() does not fire onStepEnter/onStateChange.
		const gen = this.generation;
		const initialStep = this.definition.steps[this.definition.initialStepId];
		try {
			if (initialStep.onEnter) {
				await initialStep.onEnter(this.state.data, this.context);
			}
			if (this.generation !== gen) {
				return;
			}
			this.events.onStepEnter?.(this.definition.initialStepId, this.state.data);
			this.debug(`Entered initial step: ${this.definition.initialStepId}`);
			// FIX 7: emit a state change after the awaited onEnter so async onEnter
			// side effects reach subscribers (harmless when there are none yet).
			this.notifyStateChange();
		} catch (error) {
			this.handleError(error, "lifecycle");
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
		const snapshot = { ...this.state, progress: this.computeProgress() };
		// FIX 8: shallow-freeze the snapshot and its stepStatuses to prevent
		// callers from mutating internal state. `data` is intentionally NOT
		// frozen (user data may legitimately be mutated / re-set via updateData).
		Object.freeze(snapshot.stepStatuses);
		return Object.freeze(snapshot);
	}

	/**
	 * Registers a plugin (chainable). Throws WizardConfigurationError on a
	 * duplicate name. The plugin's `onInit` fires immediately (fire-and-forget)
	 * and may run concurrently with any in-progress step lifecycle — plugins must
	 * not assume `onInit` has completed before their first hook fires.
	 */
	use(plugin: WizardPlugin<T>): this {
		this.pluginHost.add(plugin);
		this.pluginHost.dispatchInitOne(plugin, this.readonlyFacade);
		return this;
	}

	/**
	 * Removes a plugin by name, invoking its destroy() first. No-op if absent.
	 */
	async removePlugin(name: string): Promise<void> {
		await this.pluginHost.remove(name);
	}

	/**
	 * Tears down the machine: runs every plugin's destroy() in REVERSE
	 * registration order. Safe to call multiple times.
	 */
	async destroy(): Promise<void> {
		await this.pluginHost.destroyAll();
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
	 * Serializes the current wizard runtime state into a plain object.
	 */
	serialize(): WizardSerializedState<T> {
		const snapshot = this.snapshot;
		return {
			version: SERIALIZED_STATE_VERSION,
			currentStepId: snapshot.currentStepId,
			data: this.cloneData(snapshot.data),
			isValid: snapshot.isValid,
			isCompleted: snapshot.isCompleted,
			validationErrors: snapshot.validationErrors
				? { ...snapshot.validationErrors }
				: undefined,
			stepStatuses: { ...snapshot.stepStatuses },
			visitedSteps: this.visited,
			history: this.history,
		};
	}

	/**
	 * Restores a previously serialized wizard runtime state.
	 */
	restore(serializedState: WizardSerializedState<T>): void {
		this.assertRestorableState(serializedState);

		this.stepHistory = [...serializedState.history];
		this.visitedSteps = new Set([
			...serializedState.visitedSteps,
			serializedState.currentStepId,
		]);

		this.state = {
			currentStepId: serializedState.currentStepId,
			data: this.cloneData(serializedState.data),
			isValid: serializedState.isValid,
			isCompleted: serializedState.isCompleted,
			// FIX 6: a restored state sitting on the initial step is not canGoBack,
			// matching the first-step definition used elsewhere in the machine.
			canGoBack:
				serializedState.currentStepId !== this.definition.initialStepId &&
				this.stepHistory.length > 1,
			validationErrors: serializedState.validationErrors
				? { ...serializedState.validationErrors }
				: undefined,
			stepStatuses: this.normalizeRestoredStepStatuses(serializedState),
		};

		this.notifyStateChange();

		// FIX 11: re-validate the restored current step so a stale isValid:true on
		// actually-invalid data is corrected (fire-and-forget; emits onStateChange).
		void this.validate();
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
			this.handleError(error, "validation");
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
			this.handleError(error, "submit");
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
				const err = new WizardValidationError(validationResult.errors || {});
				this.handleError(err, "validation");
				throw err;
			}

			// Submit current step
			const currentStep = this.currentStep;
			if (currentStep.onSubmit) {
				await currentStep.onSubmit(this.state.data, this.context);
				// FIX 2: a reset()/cancel() during onSubmit supersedes this transition.
				if (this.isTransitionStale()) {
					return;
				}
				this.events.onSubmit?.(currentStep.id, this.state.data);
			}

			// Mark current step as completed before navigating
			this.setStepStatusInternal(this.state.currentStepId, "completed");

			// Resolve next step
			const nextStepId = await this.resolveNextStep();
			// FIX 2: a reset()/cancel() during resolveNextStep supersedes this transition.
			if (this.isTransitionStale()) {
				return;
			}
			if (!nextStepId) {
				// No next step - we're at the end
				await this.complete();
				return;
			}

			// Navigate to next step
			await this.navigateToStep(nextStepId, "next");
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
				await this.navigateToStep(previousStepId, "previous", {
					pushToHistory: false,
				});
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
			await this.navigateToStep(previousStepId, "previous");
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

			await this.navigateToStep(targetStepId, "previous", {
				pushToHistory: false,
			});
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
					const err = new WizardValidationError(validationResult.errors || {});
					this.handleError(err, "validation");
					throw err;
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
			await this.navigateToStep(stepId, "goTo", { skipLifecycle });
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
		type: "next" | "previous" | "goTo",
		options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
	): Promise<void> {
		const { pushToHistory = true, skipLifecycle = false } = options ?? {};
		const currentStep = this.currentStep;
		const targetStep = this.definition.steps[stepId];

		// WIZ-007: beforeTransition (sequential, veto/throw aware) at the very top,
		// before onLeave / state write, where both from and to are known.
		const fromStepId = currentStep.id;
		const event = {
			type,
			fromStepId,
			toStepId: stepId,
			data: this.state.data as never,
			timestamp: Date.now(),
		};
		// A beforeTransition throw aborts the transition. Do NOT report it here:
		// it is not a WizardValidationError, so withTransition's catch is the
		// single reporter for it (no state write has happened yet). Just rethrow
		// so withTransition handles + reports it once.
		const proceed = await this.pluginHost.dispatchBeforeTransition(event);
		if (!proceed) {
			// Veto: silent cancel. No leave/enter, no state write, no afterTransition.
			return;
		}
		// A plugin may have awaited while reset()/cancel() interrupted.
		if (this.isTransitionStale()) {
			return;
		}

		// Call onLeave for current step
		if (!skipLifecycle) {
			if (currentStep.onLeave) {
				await currentStep.onLeave(this.state.data, this.context);
			}
			// FIX 2: a reset()/cancel() during onLeave supersedes this transition.
			if (this.isTransitionStale()) {
				return;
			}
			this.events.onStepLeave?.(currentStep.id, this.state.data);
		}

		// Update history stack
		if (pushToHistory) {
			this.stepHistory.push(stepId);
		}

		// Update state.
		// FIX 3: preserve a "completed" status on the target step (e.g. when going
		// back to an already-completed step); only mark it "active" otherwise.
		const targetStatus =
			this.state.stepStatuses[stepId] === "completed" ? "completed" : "active";
		this.state = {
			...this.state,
			currentStepId: stepId,
			isValid: true,
			validationErrors: undefined,
			canGoBack: this.stepHistory.length > 1,
			stepStatuses: {
				...this.state.stepStatuses,
				[stepId]: targetStatus,
			},
		};

		this.visitedSteps.add(stepId);

		// Call onEnter for new step
		if (!skipLifecycle) {
			if (targetStep.onEnter) {
				await targetStep.onEnter(this.state.data, this.context);
			}
			// FIX 2: a reset()/cancel() during onEnter supersedes this transition.
			if (this.isTransitionStale()) {
				return;
			}
			this.events.onStepEnter?.(stepId, this.state.data);
		}

		this.notifyStateChange();

		// WIZ-007: afterTransition fires ONLY after the committed notifyStateChange
		// (not on any stale early-return above). Isolated per-plugin.
		await this.pluginHost.dispatchAfterTransition(event);
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
	 * Resets the wizard to its initial state.
	 *
	 * - Restores `currentStepId` to `definition.initialStepId`.
	 * - Restores `data` to a fresh deep clone of the initial snapshot.
	 * - Clears navigation history and visited steps.
	 * - Resets all step statuses (pristine / active / skipped).
	 * - Clears validation errors and `isCompleted`.
	 * - Emits `onStateChange`, then `onReset`, then re-fires `onEnter` /
	 *   `onStepEnter` for the initial step (async, non-blocking — mirrors
	 *   constructor behavior).
	 *
	 * Does NOT call `onComplete` and does NOT fire `onLeave` for the
	 * outgoing step — `reset()` is a destructive restart, not navigation.
	 *
	 * @param data Optional override that replaces the stored initial-data
	 *   snapshot. Subsequent `reset()` calls will use this new value.
	 */
	reset(data?: T): void {
		// FIX 2: supersede any in-flight transition so its resuming awaits become
		// no-ops and cannot corrupt the freshly-reset state.
		this.generation++;

		if (data !== undefined) {
			this.initialData = this.cloneData(data);
		}

		const initialStepId = this.definition.initialStepId;
		this.stepHistory = [initialStepId];
		this.visitedSteps = new Set([initialStepId]);
		this.state = {
			currentStepId: initialStepId,
			data: this.cloneData(this.initialData),
			isValid: true,
			isCompleted: false,
			canGoBack: false,
			validationErrors: undefined,
			stepStatuses: this.initializeStepStatuses(),
		};

		this.notifyStateChange();
		this.events.onReset?.();
		this.debug(`Wizard reset to initial step: ${initialStepId}`);

		// Re-fire onEnter for the initial step (fire-and-forget, mirrors constructor).
		void this.initializeFirstStep();
	}

	/**
	 * Cancels the wizard. Awaits any registered cancel handlers
	 * (`definition.onCancel` and `events.onCancel`) and then calls `reset()`.
	 *
	 * If neither handler is registered, behaves identically to `reset()`.
	 */
	async cancel(): Promise<void> {
		// FIX 2: supersede any in-flight transition immediately, before awaiting
		// the cancel handlers, so a resuming transition cannot corrupt state.
		this.generation++;

		let handlerError: unknown;
		try {
			if (this.definition.onCancel) {
				await this.definition.onCancel(this.state.data, this.context);
			}
			const eventCancel = this.events.onCancel;
			if (eventCancel) {
				await eventCancel(this.state.data);
			}
		} catch (error) {
			handlerError = error;
		} finally {
			// FIX 1: the wizard is ALWAYS returned to its initial state, even when
			// a cancel handler throws.
			this.reset();
			this.debug("Wizard cancelled");
		}

		// FIX 1: surface any handler error after the reset has run.
		if (handlerError !== undefined) {
			this.handleError(handlerError, "lifecycle");
			throw handlerError;
		}
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

	private assertRestorableState(
		serializedState: WizardSerializedState<T>,
	): void {
		if (!serializedState || typeof serializedState !== "object") {
			throw new WizardRestoreError("Serialized state must be an object");
		}

		if (serializedState.version !== SERIALIZED_STATE_VERSION) {
			throw new WizardRestoreError(
				`Unsupported serialized wizard state version: ${serializedState.version}`,
			);
		}

		if (!this.isKnownStepId(serializedState.currentStepId)) {
			throw new WizardRestoreError(
				`Serialized current step "${serializedState.currentStepId}" does not exist`,
			);
		}

		// FIX 5: data must be present, otherwise cloneData(undefined) yields an
		// undefined state.data and a downstream crash.
		if (serializedState.data === undefined) {
			throw new WizardRestoreError(
				"Serialized state is missing required `data`",
			);
		}

		if (!Array.isArray(serializedState.history)) {
			throw new WizardRestoreError("Serialized history must be an array");
		}

		if (serializedState.history.length === 0) {
			throw new WizardRestoreError("Serialized history must not be empty");
		}

		if (
			serializedState.history[serializedState.history.length - 1] !==
			serializedState.currentStepId
		) {
			throw new WizardRestoreError(
				"Serialized history must end with the current step",
			);
		}

		if (!Array.isArray(serializedState.visitedSteps)) {
			throw new WizardRestoreError("Serialized visitedSteps must be an array");
		}

		if (
			!serializedState.stepStatuses ||
			typeof serializedState.stepStatuses !== "object" ||
			Array.isArray(serializedState.stepStatuses)
		) {
			throw new WizardRestoreError("Serialized stepStatuses must be an object");
		}

		for (const stepId of [
			...serializedState.history,
			...serializedState.visitedSteps,
		]) {
			if (!this.isKnownStepId(stepId)) {
				throw new WizardRestoreError(
					`Serialized step "${stepId}" does not exist`,
				);
			}
		}

		for (const [stepId, status] of Object.entries(
			serializedState.stepStatuses,
		)) {
			if (!this.isKnownStepId(stepId)) {
				throw new WizardRestoreError(
					`Serialized step status references unknown step "${stepId}"`,
				);
			}
			if (!VALID_STEP_STATUSES.has(status as StepStatus)) {
				throw new WizardRestoreError(
					`Serialized step "${stepId}" has invalid status "${status}"`,
				);
			}
		}
	}

	private normalizeRestoredStepStatuses(
		serializedState: WizardSerializedState<T>,
	): Record<StepId, StepStatus> {
		const statuses = this.initializeStepStatuses(serializedState.currentStepId);
		for (const [stepId, status] of Object.entries(
			serializedState.stepStatuses,
		)) {
			statuses[stepId as StepId] = status as StepStatus;
		}
		if (!serializedState.isCompleted) {
			// FIX 4: preserve a meaningful serialized status for the current step;
			// only default to "active" when there is no meaningful serialized status.
			const serializedCurrent =
				serializedState.stepStatuses[serializedState.currentStepId];
			const isMeaningful =
				serializedCurrent === "completed" ||
				serializedCurrent === "error" ||
				serializedCurrent === "visited";
			if (!isMeaningful) {
				statuses[serializedState.currentStepId] = "active";
			}
		}
		return statuses;
	}

	private isKnownStepId(stepId: StepId): boolean {
		return Object.hasOwn(this.definition.steps, stepId);
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
	 * Computes the derived progress snapshot from the current state.
	 * Insertion order of `definition.steps` is used as the canonical step order.
	 * Steps whose status is "skipped" are excluded from `enabledStepIds`.
	 */
	private computeProgress(): WizardProgress {
		// FIX 10: return the cached progress until the state version changes so
		// the returned reference is stable across snapshot reads.
		if (
			this.cachedProgress !== null &&
			this.cachedProgressVersion === this.stateVersion
		) {
			return this.cachedProgress;
		}

		const allStepIds = Object.keys(this.definition.steps);
		const statuses = this.state.stepStatuses;
		const enabledStepIds = allStepIds.filter(
			(id) => statuses[id] !== "skipped",
		);

		let completedSteps = 0;
		for (const id of enabledStepIds) {
			if (statuses[id] === "completed") {
				completedSteps++;
			}
		}

		const enabledSteps = enabledStepIds.length;
		const currentStepIndex = enabledStepIds.indexOf(this.state.currentStepId);
		const percentage =
			enabledSteps === 0
				? 0
				: Math.round((completedSteps / enabledSteps) * 100);

		// FIX 9: align isFirstStep/isLastStep with the navigation-graph
		// definition used by the state manager.
		const isFirstStep =
			this.state.currentStepId === this.definition.initialStepId;
		const isLastStep = this.resolveNextStepSync() == null;

		const progress: WizardProgress = {
			totalSteps: allStepIds.length,
			enabledSteps,
			completedSteps,
			currentStepIndex,
			enabledStepIds,
			percentage,
			isFirstStep,
			isLastStep,
		};

		this.cachedProgress = progress;
		this.cachedProgressVersion = this.stateVersion;
		return progress;
	}

	/**
	 * Best-effort synchronous resolution of the next step id, mirroring the
	 * async `resolveNextStep()` for the synchronously-resolvable cases (static
	 * transitions, boolean / synchronous guards, synchronous conditional/resolver
	 * branches). Returns `null` when there is no resolvable next step. If a
	 * transition or guard resolves asynchronously (returns a Promise) the
	 * resolution cannot be completed synchronously and `null` is returned for
	 * that branch — `isLastStep` then reflects the best synchronous estimate.
	 */
	private resolveNextStepSync(): StepId | null {
		const data = this.state.data;
		const ctx = this.context;
		const isPromise = (v: unknown): v is Promise<unknown> =>
			typeof (v as { then?: unknown })?.then === "function";

		const resolveTransitionSync = (
			transition: WizardStepDefinition<T>["next"],
		): StepId | null => {
			if (!transition) {
				return null;
			}
			switch (transition.type) {
				case "static":
					return transition.to;
				case "conditional": {
					for (const branch of transition.branches) {
						const canProceed = branch.when(data, ctx);
						if (isPromise(canProceed)) {
							return null;
						}
						if (canProceed) {
							return branch.to;
						}
					}
					return null;
				}
				case "resolver": {
					const resolved = transition.resolve(data, ctx);
					return isPromise(resolved) ? null : resolved;
				}
				default:
					return null;
			}
		};

		const evaluateGuardSync = (
			guard: WizardStepDefinition<T>["enabled"],
		): boolean | null => {
			if (guard === undefined) {
				return true;
			}
			if (typeof guard === "boolean") {
				return guard;
			}
			const result = guard(data, ctx);
			return isPromise(result) ? null : result;
		};

		const visited = new Set<StepId>();
		let stepId = resolveTransitionSync(this.currentStep.next);

		while (stepId) {
			if (visited.has(stepId)) {
				return null;
			}
			visited.add(stepId);

			const step = this.definition.steps[stepId];
			if (!step) {
				return null;
			}

			const isEnabled = evaluateGuardSync(step.enabled);
			if (isEnabled === null || isEnabled) {
				// Unknown (async) guard is optimistically treated as enabled so a
				// step with an async guard does not spuriously flag isLastStep.
				return stepId;
			}

			stepId = resolveTransitionSync(step.next);
		}

		return null;
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
	 * Handles errors: wraps non-Errors, fires events.onError (unchanged signature),
	 * then dispatches to plugin onError hooks with an ErrorContext (WIZ-007).
	 */
	private handleError(
		error: unknown,
		phase: ErrorContext<T>["phase"] = "transition",
		stepId?: StepId,
	): void {
		const err = error instanceof Error ? error : new Error(String(error));
		this.events.onError?.(err);
		// WIZ-007: build the ErrorContext and dispatch to plugins (isolated; a
		// throw inside a plugin's onError is swallowed by the host — no recursion).
		const ctx: ErrorContext<T> = {
			stepId: stepId ?? this.state.currentStepId,
			phase,
			data: this.state.data as never,
		};
		void this.pluginHost.dispatchError(err, ctx);
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

		// FIX 2: capture the abort generation for the duration of this transition.
		// A reset()/cancel() fired mid-flight bumps `this.generation`, after which
		// the state-writing primitives (navigateToStep / notifyStateChange) become
		// silent no-ops so a resuming stale transition cannot corrupt fresh state.
		this.transitionGen = this.generation;
		this.isTransitioning = true;
		try {
			return await operation();
		} catch (error) {
			// A WizardValidationError was already reported (with phase "validation")
			// and its step status set by the navigation method that threw it; do not
			// re-report it here. All other errors are reported with the default phase.
			if (!(error instanceof WizardValidationError)) {
				this.handleError(error);
			}
			throw error;
		} finally {
			this.isTransitioning = false;
		}
	}

	/**
	 * FIX 2: true when the current async transition has been superseded by a
	 * reset()/cancel(). State writes guarded by this become no-ops.
	 */
	private isTransitionStale(): boolean {
		return (
			this.transitionGen !== undefined && this.transitionGen !== this.generation
		);
	}
}
