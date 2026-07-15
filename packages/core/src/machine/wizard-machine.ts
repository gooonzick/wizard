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
	StepValidationSummary,
	ValidationResult,
	ValidationSummary,
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
	/**
	 * Fired AFTER a data mutation (updateField / updateData / setData) that
	 * actually changes at least one top-level field. NOT fired on reset(),
	 * restore(), or navigation. `changedFields` are the top-level keys whose
	 * value changed (Object.is comparison). See WIZ-010.
	 */
	onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
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

/**
 * Result of a best-effort synchronous next-step resolution.
 * - `resolved`: a next step was determined synchronously.
 * - `terminal`: definitively no next step (current path ends here).
 * - `unknown`: cannot be determined synchronously (async transition/guard, a
 *   user callback threw, a dangling reference, or a cycle).
 */
type SyncResolution =
	| { kind: "resolved"; stepId: StepId }
	| { kind: "terminal" }
	| { kind: "unknown" };

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
	/**
	 * FIX F2: first error thrown by a user callback (guard/branch/resolver) during
	 * a synchronous progress computation. Reporting is deferred out of the snapshot
	 * call stack and deduped per `stateVersion` (see `computeProgress`).
	 */
	private pendingProgressError: unknown = undefined;
	private reportedProgressErrorVersion = -1;
	/**
	 * Set by `validate()` when it has already reported a thrown validator error
	 * via `handleError(.., "validation")`. Callers (goNext/goTo/submit) consume
	 * and clear it so they do NOT re-report the same logical validation failure,
	 * ensuring plugin `onError` fires exactly once per failure.
	 */
	private validateAlreadyReported = false;
	/** Deep-cloned snapshot of the data used to seed `reset()`. */
	private initialData: T;
	// WIZ-007: plugin host and the read-only facade passed to plugin hooks.
	private pluginHost!: PluginHost<T>;
	private readonlyFacade!: WizardMachineReadonly<T>;
	/** WIZ-010: field-level subscribers keyed by field name. */
	private fieldWatchers = new Map<
		keyof T,
		Set<(newValue: T[keyof T], oldValue: T[keyof T]) => void>
	>();

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
		// isolated hook throws through handleError; phase is passed through so
		// lifecycle hooks (onComplete, onReset, destroy) report as "lifecycle".
		this.pluginHost = new PluginHost<T>((err, phase) =>
			this.handleError(err, phase),
		);
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
	 * Whether the machine has been destroyed (plugins torn down). Terminal.
	 */
	get isDestroyed(): boolean {
		return this.pluginHost.isDestroyed;
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
		// FIX M-b: validate() calls checkAborted() outside its try, so an aborted
		// signal makes it return a rejected promise; without a `.catch` this
		// fire-and-forget call would surface as an unhandled rejection.
		void this.validate().catch(() => {});
	}

	/**
	 * Updates wizard data
	 */
	updateData(updater: (data: T) => T): void {
		// WIZ-010: shallow-copy the current top-level keys BEFORE running the
		// updater. This survives an in-place-mutating updater (which would leave
		// prevRef === newData) so the shallow diff is still correct.
		const prevSnapshot = { ...this.state.data };
		const newData = updater(this.state.data);
		const newStatuses = this.recalculateSkippedStatuses();
		this.state = {
			...this.state,
			data: newData,
			stepStatuses: newStatuses,
		};
		this.notifyStateChange();
		const changedFields = this.diffChangedFields(prevSnapshot, newData);
		this.emitDataChange(prevSnapshot, newData, changedFields);
	}

	/**
	 * Updates a single top-level field. If the new value is Object.is-equal to the
	 * current value this is a NO-OP: no state write, no onStateChange, no
	 * onDataChange/watchers/plugin hook. Otherwise commits the change and fires
	 * onDataChange (and watchers / plugin onDataChange) with changedFields = [field].
	 * WIZ-010.
	 */
	updateField<K extends keyof T>(field: K, value: T[K]): void {
		const prev = this.state.data;
		if (Object.is(prev[field], value)) {
			return; // no-op: identical value
		}
		const prevSnapshot = { ...prev };
		const nextData = { ...prev, [field]: value };
		const newStatuses = this.recalculateSkippedStatuses();
		this.state = {
			...this.state,
			data: nextData,
			stepStatuses: newStatuses,
		};
		this.notifyStateChange();
		this.emitDataChange(prevSnapshot, nextData, [field]);
	}

	/**
	 * Sets wizard data directly
	 */
	setData(data: T): void {
		const prevSnapshot = { ...this.state.data };
		const newStatuses = this.recalculateSkippedStatuses();
		// FIX M-d: clone the caller's input (matching the constructor/reset/
		// serialize contract) so a later external mutation of `data` cannot
		// silently mutate `state.data` while bypassing notifyStateChange.
		// `updateData`'s updater-return is a separate, documented in/out
		// contract and is intentionally left as-is.
		const cloned = this.cloneData(data);
		this.state = {
			...this.state,
			data: cloned,
			stepStatuses: newStatuses,
		};
		this.notifyStateChange();
		const changedFields = this.diffChangedFields(prevSnapshot, cloned);
		this.emitDataChange(prevSnapshot, cloned, changedFields);
	}

	/**
	 * Subscribes to changes of a single top-level field. The callback fires only
	 * when that field's value changes (Object.is) via updateField / updateData /
	 * setData — NOT on reset(), restore(), or navigation. Returns an unsubscribe
	 * function. A throwing callback is isolated: it is routed to onError (phase
	 * "data") and does not prevent other watchers/plugins or corrupt the update.
	 */
	watchField<K extends keyof T>(
		field: K,
		callback: (newValue: T[K], oldValue: T[K]) => void,
	): () => void {
		let set = this.fieldWatchers.get(field);
		if (!set) {
			set = new Set();
			this.fieldWatchers.set(field, set);
		}
		const cb = callback as (n: T[keyof T], o: T[keyof T]) => void;
		set.add(cb);
		return () => {
			const s = this.fieldWatchers.get(field);
			if (!s) return;
			s.delete(cb);
			if (s.size === 0) this.fieldWatchers.delete(field);
		};
	}

	/** Shallow diff of top-level keys (Object.is). Returns changed keys. */
	private diffChangedFields(prev: T, next: T): (keyof T)[] {
		const keys = new Set<keyof T>([
			...(Object.keys(prev) as (keyof T)[]),
			...(Object.keys(next) as (keyof T)[]),
		]);
		const changed: (keyof T)[] = [];
		for (const key of keys) {
			if (!Object.is(prev[key], next[key])) changed.push(key);
		}
		return changed;
	}

	/**
	 * WIZ-010: notifies data-change subscribers AFTER the state has been committed
	 * and onStateChange has fired. No-op when nothing changed. All three subscriber
	 * kinds are ISOLATED: a throw is routed to onError (phase "data") and never
	 * prevents the others or corrupts the update.
	 * Order: (1) events.onDataChange, (2) field watchers, (3) plugin onDataChange.
	 */
	private emitDataChange(prev: T, next: T, changedFields: (keyof T)[]): void {
		if (changedFields.length === 0) return;

		// (1) machine-level config callback — isolated for the new event.
		if (this.events.onDataChange) {
			try {
				this.events.onDataChange(prev, next, changedFields);
			} catch (err) {
				this.handleError(err, "data");
			}
		}

		// (2) field watchers — isolated per callback; snapshot the set so a
		// callback that unsubscribes mid-iteration does not disturb the loop.
		for (const field of changedFields) {
			const set = this.fieldWatchers.get(field);
			if (!set) continue;
			for (const cb of [...set]) {
				try {
					cb(next[field], prev[field]);
				} catch (err) {
					this.handleError(err, "data");
				}
			}
		}

		// (3) plugin hook — isolated inside the host, fire-and-forget (like
		// dispatchComplete/dispatchReset).
		void this.pluginHost.dispatchDataChange(
			prev as never,
			next as never,
			changedFields as never,
		);
	}

	/**
	 * Validates current step
	 */
	async validate(): Promise<ValidationResult> {
		this.checkAborted();
		// Reset the per-call dedupe flag; set only when this call self-reports a
		// thrown validator error below.
		this.validateAlreadyReported = false;
		// FIX F6: capture the generation so a reset()/cancel() during the awaited
		// validator supersedes this validation (mirrors isTransitionStale).
		const gen = this.generation;
		try {
			const step = this.currentStep;
			const validator = step.validate || alwaysValid;

			const result = await validator(this.state.data, this.context);

			// FIX F6: a reset()/cancel() during the awaited validator supersedes this
			// validation. Return the computed result but do NOT clobber the fresh
			// state or emit against it.
			if (this.generation !== gen) {
				return result;
			}

			this.state = {
				...this.state,
				isValid: result.valid,
				validationErrors: result.errors,
			};

			this.events.onValidation?.(result);
			this.notifyStateChange();

			return result;
		} catch (error) {
			// FIX F6: if superseded, do not report or write against stale state.
			if (this.generation !== gen) {
				return {
					valid: false,
					errors: { general: "Validation error occurred" },
				};
			}
			// A validator that THREW is a genuine validation failure: report it once
			// here (phase "validation") and mark it reported so the caller's !valid
			// branch does not re-report the same logical failure.
			this.handleError(error, "validation");
			this.validateAlreadyReported = true;
			return { valid: false, errors: { general: "Validation error occurred" } };
		}
	}

	/**
	 * Validates every ENABLED step's validator without navigating (dry-run).
	 * Steps without a `validate` are considered valid. Steps whose `enabled`
	 * guard resolves to false are skipped entirely (not included in the summary).
	 *
	 * By default this does NOT mutate stepStatuses, isValid, or validationErrors,
	 * does NOT fire onValidation/onStateChange, and is FULLY ISOLATED from plugins
	 * (no plugin hook — including onError — is dispatched). With
	 * `updateStatuses: true`, invalid steps are marked "error" in a single state
	 * write that emits exactly one onStateChange.
	 */
	async validateAll(options?: {
		updateStatuses?: boolean;
	}): Promise<ValidationSummary> {
		this.checkAborted();
		const { updateStatuses = false } = options ?? {};

		const steps: StepValidationSummary[] = [];
		const invalidStepIds: StepId[] = [];

		// Insertion order == canonical order (matches computeProgress / Progress API).
		for (const [stepId, step] of Object.entries(this.definition.steps)) {
			// Skip disabled steps (boolean false OR guard resolving to false).
			const isEnabled = await evaluateGuard(
				step.enabled,
				this.state.data,
				this.context,
			);
			if (!isEnabled) {
				continue;
			}

			const validator = step.validate || alwaysValid;

			let result: ValidationResult;
			try {
				result = await validator(this.state.data, this.context);
			} catch (error) {
				// A thrown validator is caught here and marked invalid with the
				// sentinel `_error` field. Do NOT call handleError / dispatch to
				// plugins — validateAll is fully isolated from the plugin system.
				const message = error instanceof Error ? error.message : String(error);
				result = { valid: false, errors: { _error: message } };
			}

			steps.push({ stepId, valid: result.valid, errors: result.errors });
			if (!result.valid) {
				invalidStepIds.push(stepId);
			}
		}

		// Optionally persist "error" on invalid steps in a SINGLE state write.
		if (updateStatuses && invalidStepIds.length > 0) {
			const nextStatuses = { ...this.state.stepStatuses };
			for (const id of invalidStepIds) {
				nextStatuses[id] = "error";
			}
			this.state = { ...this.state, stepStatuses: nextStatuses };
			this.notifyStateChange(); // exactly one emit
		}

		return {
			valid: invalidStepIds.length === 0,
			steps,
			firstInvalidStepId: invalidStepIds[0] ?? null,
			invalidStepIds,
		};
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
	 * Submits current step.
	 *
	 * Reject-when-busy contract (FIX F5): `submit()` acquires the same busy lock
	 * as the navigation methods. A `submit()` (or navigation) already in flight
	 * causes a concurrent `submit()` to reject synchronously with a
	 * `WizardNavigationError` (reason `"busy"`) — this prevents a double-click or
	 * a `submit()`/`goNext()` race from invoking `onSubmit` twice. The lock is
	 * released in `finally` and `isBusy` is `true` for the duration.
	 *
	 * Not routed through `withTransition`: its catch reports non-validation errors
	 * with the default phase `"transition"`, which would double-report `onSubmit`
	 * throws already reported here with phase `"submit"`. The inner catch below
	 * keeps the phase-`"submit"` reporting.
	 */
	async submit(): Promise<void> {
		this.checkAborted();
		// FIX F5: reject-when-busy, acquired synchronously (no await between the
		// guard and the flag) so the losing concurrent caller observes the lock.
		this.ensureNotBusy();
		// FIX F5: participate in the generation-supersede model so a reset()/cancel()
		// mid-submit cannot make complete() re-complete the freshly-reset state.
		this.transitionGen = this.generation;
		this.isTransitioning = true;
		try {
			if (this.state.isCompleted) {
				throw new WizardNavigationError("Wizard is already completed");
			}

			const step = this.currentStep;

			// Validate before submit (validate() is generation-guarded per F6)
			const validationResult = await this.validate();
			if (!validationResult.valid) {
				const err = new WizardValidationError(validationResult.errors || {});
				// Report the validation failure exactly once, with phase "validation"
				// (unless validate() already reported a thrown validator error). The
				// catch below skips WizardValidationError so it is not re-reported.
				if (!this.validateAlreadyReported) {
					this.handleError(err, "validation");
				}
				throw err;
			}

			// Execute step's submit handler
			if (step.onSubmit) {
				await step.onSubmit(this.state.data, this.context);
				// FIX F5: a reset()/cancel() during onSubmit supersedes this submit.
				if (this.isTransitionStale()) {
					return;
				}
				this.events.onSubmit?.(step.id, this.state.data);
			}

			// Check if this is the last step
			const nextStepId = await this.resolveNextStep();
			// FIX F5: a reset()/cancel() during resolveNextStep supersedes this submit.
			if (this.isTransitionStale()) {
				return;
			}
			if (!nextStepId) {
				await this.complete();
			}
		} catch (error) {
			// A WizardValidationError was already reported above (phase "validation");
			// do not re-report it. All other errors are reported with phase "submit".
			if (!(error instanceof WizardValidationError)) {
				this.handleError(error, "submit");
			}
			throw error;
		} finally {
			this.isTransitioning = false;
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
				// FIX F1: broadcast the errored step. setStepStatusInternal does not
				// emit, and this branch runs on the validation gate BEFORE any
				// navigateToStep, so without this emit subscribers never observe the
				// "error" status. This write is non-navigational (pre-navigation) and
				// therefore outside the veto invariant.
				this.notifyStateChange();
				const err = new WizardValidationError(validationResult.errors || {});
				// If validate() already reported a thrown validator error, do not
				// re-report; otherwise this is the single reporter for the failure.
				if (!this.validateAlreadyReported) {
					this.handleError(err, "validation");
				}
				throw err;
			}

			// Submit current step
			// DOCUMENT (M-e): an `onSubmit` throw here is not locally caught, so it
			// bubbles to `withTransition`'s catch and is reported with the default
			// phase `"transition"` — whereas the same throw inside `submit()` is
			// reported with phase `"submit"` (see that method's inner try/catch).
			// This phase-label inconsistency between the two `onSubmit` call sites
			// is a known, accepted-for-release finding; unifying it would require a
			// `submitAlreadyReported` flag (mirroring `validateAlreadyReported`) that
			// `withTransition` consumes to skip re-reporting, to avoid a second
			// `handleError` call for the same throw. Not fixed in this pass.
			const currentStep = this.currentStep;
			if (currentStep.onSubmit) {
				await currentStep.onSubmit(this.state.data, this.context);
				// FIX 2: a reset()/cancel() during onSubmit supersedes this transition.
				if (this.isTransitionStale()) {
					return;
				}
				this.events.onSubmit?.(currentStep.id, this.state.data);
			}

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
				// Target is the entry below the current step. Do NOT pop yet —
				// navigateToStep pops only after beforeTransition passes.
				const previousStepId = this.stepHistory[this.stepHistory.length - 2];

				await this.navigateToStep(previousStepId, "previous", {
					pushToHistory: false,
					popHistory: 1,
				});
				this.debug(
					`Navigated to previous step (from history): ${previousStepId}`,
				);
				return;
			}

			// Fallback: use transition resolver when history is empty
			// DOCUMENT (M-f): navigateToStep is called here with the default
			// `pushToHistory: true`, so a resolver-based "previous" step is treated
			// as a forward commit onto the history stack (it grows) rather than a
			// pop — reachable only when history was cleared/restored to a single
			// entry while the step defines an explicit `previous` transition. This
			// still runs entirely inside navigateToStep after the beforeTransition
			// veto (see the veto-safety invariant), so no invariant is violated.
			// The alternative — popping — has no correct target when history has
			// only one entry, so the push-based behavior is intentionally kept.
			const previousStepId = await this.resolvePreviousStep();
			if (!previousStepId) {
				throw new WizardNavigationError("No previous step available");
			}

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

			// Compute the target without mutating the stack. navigateToStep pops
			// `steps` entries only after beforeTransition passes.
			const targetIndex = this.stepHistory.length - 1 - steps;
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

			await this.navigateToStep(targetStepId, "previous", {
				pushToHistory: false,
				popHistory: steps,
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
					// If validate() already reported a thrown validator error, do not
					// re-report; otherwise this is the single reporter for the failure.
					if (!this.validateAlreadyReported) {
						this.handleError(err, "validation");
					}
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
	 *
	 * FIX F4: if `onEnter` throws, the machine remains on the target step (the
	 * state was already committed before `onEnter`) and emits one `onStateChange`;
	 * `onStepEnter` and `afterTransition` do not fire; the error is reported once
	 * (phase `transition`).
	 */
	private async navigateToStep(
		stepId: StepId,
		type: "next" | "previous" | "goTo",
		options?: {
			pushToHistory?: boolean;
			skipLifecycle?: boolean;
			popHistory?: number;
		},
	): Promise<void> {
		const {
			pushToHistory = true,
			skipLifecycle = false,
			popHistory = 0,
		} = options ?? {};
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

		// Update history stack (commit AFTER the veto/stale checks above).
		if (popHistory > 0) {
			for (let i = 0; i < popHistory; i++) {
				this.stepHistory.pop();
			}
		} else if (pushToHistory) {
			this.stepHistory.push(stepId);
		}

		// Mark the departing step's status. Deferred to here (after the
		// beforeTransition veto / stale checks above) so a vetoed transition
		// never leaves stepStatuses mutated. Per direction:
		//   next     -> the step we are leaving is "completed"
		//   goTo     -> the step we are leaving is "visited"
		//   previous -> the step we are leaving is "visited"
		if (type === "next") {
			this.setStepStatusInternal(fromStepId, "completed");
		} else {
			// "goTo" and "previous"
			this.setStepStatusInternal(fromStepId, "visited");
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
				try {
					await targetStep.onEnter(this.state.data, this.context);
				} catch (err) {
					// FIX F4: state is already committed to the target step (above,
					// after the beforeTransition veto). Guarantee subscribers observe
					// the committed target snapshot before the error propagates.
					// onStepEnter / afterTransition are intentionally skipped (they
					// signal a SUCCESSFUL entry). The error is reported once by
					// withTransition (phase "transition"). No rollback.
					if (!this.isTransitionStale()) {
						this.notifyStateChange();
					}
					throw err;
				}
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
		// WIZ-007: dispatch plugin onReset (isolated). Fires for reset() and, via
		// cancel()'s implicit reset(), for cancel() too. Do NOT dispatch in cancel().
		void this.pluginHost.dispatchReset();
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

		// WIZ-007: dispatch plugin onComplete (isolated), after definition/events.
		void this.pluginHost.dispatchComplete(this.state.data as never);
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
	 *
	 * DOCUMENT (M-c): this method only inspects `typeof step.enabled ===
	 * "boolean"`. It is intentionally inert for *function* (and async) `enabled`
	 * guards — evaluating those here would require running arbitrary, possibly
	 * async, user code synchronously inside `updateData`/`setData`. Practical
	 * effect: a data change that would flip the result of a function guard does
	 * NOT update `stepStatuses`/`skipped` (and therefore does not affect
	 * `WizardProgress.enabledStepIds`/`percentage`) until the next navigation
	 * re-evaluates the guard. Do not attempt synchronous evaluation of function
	 * guards here.
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
		// FIX F2/F3: isLastStep is TRUE only for a genuinely terminal current path.
		// "unknown" (async transition/guard, a resolver that threw, or a cycle) is
		// reported conservatively as NOT last, so an async `next` never shows
		// "Finish". For an authoritative async answer, await getNextStepId().
		const nextResolution = this.resolveNextStepSync();
		const isLastStep = nextResolution.kind === "terminal";

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

		// FIX M-a: freeze progress (and its enabledStepIds array) before caching
		// so `snapshot.progress.enabledStepIds.push(...)` (or reassigning a field)
		// can't corrupt the shared reference returned across reads for this
		// stateVersion. Freezing an already-frozen object is a safe no-op.
		Object.freeze(progress.enabledStepIds);
		Object.freeze(progress);
		this.cachedProgress = progress;
		this.cachedProgressVersion = this.stateVersion;

		// FIX F2: flush any error recorded by a user callback during the sync
		// resolution above, OUT of the snapshot/notify call stack (queueMicrotask)
		// and at most once per stateVersion. Deferring escapes reentrancy: a user
		// onError that reads snapshot cannot re-enter computeProgress recursively.
		if (
			this.pendingProgressError !== undefined &&
			this.reportedProgressErrorVersion !== this.stateVersion
		) {
			const err = this.pendingProgressError;
			this.reportedProgressErrorVersion = this.stateVersion;
			this.pendingProgressError = undefined;
			queueMicrotask(() => this.handleError(err, "transition"));
		} else {
			// Clear even if not reported this pass (already reported for this version).
			this.pendingProgressError = undefined;
		}

		return progress;
	}

	/**
	 * Records the first error thrown by a user callback during a synchronous
	 * progress computation. Reporting is deferred + deduped in `computeProgress`
	 * to avoid re-entering the snapshot call stack (see the reentrancy hazard).
	 */
	private recordProgressError(err: unknown): void {
		// Keep only the first error for this compute pass; report is deferred+deduped.
		if (this.pendingProgressError === undefined) {
			this.pendingProgressError = err;
		}
	}

	/**
	 * Best-effort synchronous resolution of the next step, mirroring the async
	 * `resolveNextStep()` for the synchronously-resolvable cases (static
	 * transitions, boolean / synchronous guards, synchronous conditional/resolver
	 * branches). Returns a tri-state (FIX F2/F3):
	 * - `resolved` when a next step is determined synchronously,
	 * - `terminal` when there is definitively no next step,
	 * - `unknown` when it cannot be determined synchronously (async transition or
	 *   guard, a user callback threw, a dangling reference, or a cycle).
	 * Never throws: every user call is wrapped and downgraded to `unknown` while
	 * recording the first thrown error for deferred reporting.
	 */
	private resolveNextStepSync(): SyncResolution {
		const data = this.state.data;
		const ctx = this.context;
		const isPromise = (v: unknown): v is Promise<unknown> =>
			typeof (v as { then?: unknown })?.then === "function";

		const resolveTransitionSync = (
			transition: WizardStepDefinition<T>["next"],
		): SyncResolution => {
			if (!transition) {
				return { kind: "terminal" };
			}
			switch (transition.type) {
				case "static":
					return { kind: "resolved", stepId: transition.to };
				case "conditional": {
					for (const branch of transition.branches) {
						let canProceed: unknown;
						try {
							canProceed = branch.when(data, ctx);
						} catch (err) {
							this.recordProgressError(err);
							return { kind: "unknown" };
						}
						if (isPromise(canProceed)) {
							return { kind: "unknown" };
						}
						if (canProceed) {
							return { kind: "resolved", stepId: branch.to };
						}
					}
					// All branches evaluated false ⇒ definitively terminal.
					return { kind: "terminal" };
				}
				case "resolver": {
					let resolved: unknown;
					try {
						resolved = transition.resolve(data, ctx);
					} catch (err) {
						this.recordProgressError(err);
						return { kind: "unknown" };
					}
					if (isPromise(resolved)) {
						return { kind: "unknown" };
					}
					return resolved
						? { kind: "resolved", stepId: resolved as StepId }
						: { kind: "terminal" };
				}
				default:
					return { kind: "terminal" };
			}
		};

		const evaluateGuardSync = (
			guard: WizardStepDefinition<T>["enabled"],
		): boolean | "unknown" => {
			if (guard === undefined) {
				return true;
			}
			if (typeof guard === "boolean") {
				return guard;
			}
			let result: unknown;
			try {
				result = guard(data, ctx);
			} catch (err) {
				this.recordProgressError(err);
				return "unknown";
			}
			return isPromise(result) ? "unknown" : (result as boolean);
		};

		const visited = new Set<StepId>();
		let res = resolveTransitionSync(this.currentStep.next);

		while (res.kind === "resolved") {
			const stepId = res.stepId;
			if (visited.has(stepId)) {
				// Cycle: cannot determine the terminal state synchronously.
				return { kind: "unknown" };
			}
			visited.add(stepId);

			const step = this.definition.steps[stepId];
			if (!step) {
				// Dangling reference: unknown, not terminal.
				return { kind: "unknown" };
			}

			const isEnabled = evaluateGuardSync(step.enabled);
			if (isEnabled === "unknown" || isEnabled) {
				// Unknown (async) guard is optimistically treated as enabled so a
				// step with an async guard does not spuriously flag isLastStep.
				return { kind: "resolved", stepId };
			}

			res = resolveTransitionSync(step.next);
		}

		return res; // "terminal" or "unknown"
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
