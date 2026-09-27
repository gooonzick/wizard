// NOTE: intentionally duplicated from ../types.ts. `src/runes/**` must be
// self-contained because `svelte-package` emits declarations with
// libRoot=src/runes; an import that escapes libRoot yields dangling .d.ts
// references. Keep the two files in sync — tests/runes/create-wizard.test.ts
// asserts key-set parity.

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

/**
 * Options accepted by `createWizard()`.
 */
export interface CreateWizardOptions<T extends WizardData> {
	/** Read ONCE at creation — NOT reactive. Recreate the wizard to reconfigure. */
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
	 * When true (default) the wizard registers `onDestroy(() => void wizard.destroy())`.
	 * The registration is wrapped in try/catch, so calling `createWizard()`
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
}

/**
 * Actions slice - data mutations and validation
 */
export interface WizardStoreActions<T extends WizardData> {
	updateData: (updater: (data: T) => T) => void;
	setData: (data: T) => void;
	updateField: <K extends keyof T>(field: K, value: T[K]) => void;
	validate: () => Promise<void>;
	validateAll: (options?: {
		updateStatuses?: boolean;
	}) => Promise<ValidationSummary>;
	canSubmit: () => Promise<boolean>;
	submit: () => Promise<void>;
	/**
	 * Fire-and-forget (`void manager.runReset(data)`). `reset(X)` makes X the
	 * new reset baseline; `reset()` returns to the current baseline.
	 */
	reset: (data?: T) => void;
	cancel: () => Promise<void>;
	serialize: () => WizardSerializedState<T>;
	/** Fire-and-forget (`void manager.runRestore(...)`). */
	restore: (state: WizardSerializedState<T>) => void;
}

/**
 * A two-way binding target for one top-level data field.
 * `bind:value={f.value}` compatible.
 */
export interface WizardField<V> {
	get value(): V;
	set value(v: V);
}

/**
 * The rune-native wizard returned by `createWizard()`.
 */
export interface Wizard<T extends WizardData> {
	// ---- flat reactive getters (same keys as the store layer's WizardSnapshot) ----
	readonly currentStepId: StepId;
	readonly currentStep: WizardStepDefinition<T>;
	readonly data: T;
	readonly isCompleted: boolean;
	readonly stepStatuses: Record<StepId, StepStatus>;
	readonly progress: WizardProgress;
	readonly isValid: boolean;
	readonly validationErrors: Record<string, string> | undefined;
	readonly canGoNext: boolean;
	readonly canGoPrevious: boolean;
	readonly canGoBack: boolean;
	readonly isFirstStep: boolean;
	readonly isLastStep: boolean;
	readonly visitedSteps: StepId[];
	readonly availableSteps: StepId[];
	readonly stepHistory: StepId[];
	readonly isValidating: boolean;
	readonly isSubmitting: boolean;
	readonly isNavigating: boolean;

	// ---- slice getters (parity with the store layer's sub-stores) ----
	readonly state: WizardStoreState<T>;
	readonly validation: WizardStoreValidation;
	readonly navigation: WizardStoreNavigation;
	readonly loading: WizardStoreLoading;

	readonly actions: WizardStoreActions<T>;

	goNext(): Promise<void>;
	goPrevious(): Promise<void>;
	/** @deprecated Use `goPrevious()`. */
	goBack(steps?: number): Promise<void>;
	goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
	/** @deprecated Use `goTo(stepId)`. */
	goToStep(stepId: StepId): Promise<void>;

	/** `bind:value={f.value}` compatible. Stable reference per key. */
	field<K extends keyof T>(key: K): WizardField<T[K]>;

	getMachine(): WizardMachine<T>;
	getManager(): WizardStateManager<T>;
	destroy(): Promise<void>;
	readonly isDestroyed: boolean;
}
