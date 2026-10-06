import type {
	GoToOptions,
	StepId,
	StepStatus,
	ValidationSummary,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardMachine,
	WizardPlugin,
	WizardProgress,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import type { WizardStateManager } from "@gooonzick/wizard-state";
import type { Readable, Writable } from "svelte/store";

/**
 * Options accepted by `createWizardStore()`.
 */
export interface CreateWizardStoreOptions<T extends WizardData> {
	/** Read ONCE at creation — NOT reactive. Recreate the store to reconfigure. */
	definition: WizardDefinition<T>;
	/** Read ONCE at creation — NOT reactive. */
	initialData: T;
	/** Read ONCE at creation — NOT reactive. Defaults to `{}`. */
	context?: WizardContext;

	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	onError?: (error: Error) => void;
	onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;

	/**
	 * Plugins registered once at machine creation (read once, NOT reactive).
	 * `onInit` is dispatched fire-and-forget and may run concurrently with the
	 * initial step's `onEnter`.
	 */
	plugins?: WizardPlugin<T>[];

	/**
	 * When true (default) the store registers `onDestroy(() => void store.destroy())`.
	 * The registration is wrapped in try/catch, so calling `createWizardStore()`
	 * outside component initialisation is safe — you just own `destroy()` yourself.
	 */
	autoDestroy?: boolean;
}

/**
 * State slice - current step and data
 */
export interface WizardStoreState<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
	stepStatuses: Record<StepId, StepStatus>;
	progress: WizardProgress;
}

/**
 * Validation slice - validation state and errors
 */
export interface WizardStoreValidation {
	isValid: boolean;
	validationErrors?: Record<string, string>;
}

/**
 * Navigation slice - step navigation capabilities
 */
export interface WizardStoreNavigation {
	canGoNext: boolean;
	canGoPrevious: boolean;
	canGoBack: boolean;
	isFirstStep: boolean;
	isLastStep: boolean;
	visitedSteps: StepId[];
	availableSteps: StepId[];
	stepHistory: StepId[];
}

/**
 * Loading slice - async operation states
 */
export interface WizardStoreLoading {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
	/** A lazy step implementation is loading (WIZ-013). */
	isLoadingStep: boolean;
}

/**
 * Flattened aggregate — the value of `$wizard`. No key collisions between the four.
 */
export interface WizardSnapshot<T extends WizardData>
	extends WizardStoreState<T>,
		WizardStoreValidation,
		WizardStoreNavigation,
		WizardStoreLoading {}

/**
 * Helper types for individual wizard actions
 */
export type UpdateDataFn<T extends WizardData> = (
	updater: (data: T) => T,
) => void;
export type SetDataFn<T extends WizardData> = (data: T) => void;
export type UpdateFieldFn<T extends WizardData> = <K extends keyof T>(
	field: K,
	value: T[K],
) => void;
export type ValidateFn = () => Promise<void>;
export type ValidateAllFn = (options?: {
	updateStatuses?: boolean;
}) => Promise<ValidationSummary>;
export type CanSubmitFn = () => Promise<boolean>;
export type SubmitFn = () => Promise<void>;
export type ResetFn<T extends WizardData> = (data?: T) => void;
export type CancelFn = () => Promise<void>;
export type SerializeFn<T extends WizardData> = () => WizardSerializedState<T>;
export type RestoreFn<T extends WizardData> = (
	state: WizardSerializedState<T>,
) => void;

/**
 * Actions slice - data mutations and validation
 */
export interface WizardStoreActions<T extends WizardData> {
	updateData: UpdateDataFn<T>;
	setData: SetDataFn<T>;
	updateField: UpdateFieldFn<T>;
	validate: ValidateFn;
	validateAll: ValidateAllFn;
	canSubmit: CanSubmitFn;
	submit: SubmitFn;
	/**
	 * Fire-and-forget (`void manager.runReset(data)`). `reset(X)` makes X the
	 * new reset baseline; `reset()` returns to the current baseline.
	 */
	reset: ResetFn<T>;
	cancel: CancelFn;
	serialize: SerializeFn<T>;
	/** Fire-and-forget (`void manager.runRestore(...)`). */
	restore: RestoreFn<T>;
	/** Loads a lazy step's implementation ahead of navigation (WIZ-013). */
	preloadStep: (stepId: StepId) => Promise<void>;
}

/**
 * The store returned by `createWizardStore()`.
 *
 * The aggregate is a `Readable`, never a `Writable`: writing goes through
 * `field(key)` or `actions.*`. `bind:value={$wizard.data.x}` would mutate the
 * machine's (deliberately unfrozen) data in place and bypass every hook, so it
 * is a compile error by design.
 */
export interface WizardStore<T extends WizardData>
	extends Readable<WizardSnapshot<T>> {
	/** Per-channel stores for fine-grained subscriptions. */
	readonly state: Readable<WizardStoreState<T>>;
	readonly validation: Readable<WizardStoreValidation>;
	readonly navigation: Readable<WizardStoreNavigation>;
	readonly loading: Readable<WizardStoreLoading>;

	readonly actions: WizardStoreActions<T>;

	goNext(): Promise<void>;
	goPrevious(): Promise<void>;
	/** @deprecated Use `goPrevious()`. */
	goBack(steps?: number): Promise<void>;
	goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
	/** @deprecated Use `goTo(stepId)`. */
	goToStep(stepId: StepId): Promise<void>;

	/**
	 * A two-way store for one top-level data field. `set`/`update` route through
	 * `machine.updateField`, so the `Object.is` no-op guard and the authoritative
	 * `changedFields = [field]` (WIZ-010) both apply.
	 * Returns a stable reference per key.
	 */
	field<K extends keyof T>(key: K): Writable<T[K]>;

	getMachine(): WizardMachine<T>;
	getManager(): WizardStateManager<T>;

	/** Idempotent. Fire-and-forget-safe. Tears down plugins via the manager. */
	destroy(): Promise<void>;
	readonly isDestroyed: boolean;
}
