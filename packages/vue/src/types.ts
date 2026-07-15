import type {
	GoToOptions,
	StepId,
	StepStatus,
	ValidationSummary,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardProgress,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import type {
	LoadingState,
	NavigationState,
	StateSnapshot,
	ValidationState,
} from "@gooonzick/wizard-state";
import type { ComputedRef } from "vue";

// Re-export state package types for convenience
export type { LoadingState, NavigationState, StateSnapshot, ValidationState };

/**
 * Vue composable options
 */
export interface UseWizardOptions<T extends WizardData> {
	/**
	 * Read ONCE at setup and captured — NOT reactive. Changing this after the
	 * composable runs has no effect (the machine is created once). To reconfigure,
	 * remount the component with a new `key`.
	 */
	definition: WizardDefinition<T>;
	/**
	 * Read ONCE at setup and captured — NOT reactive. Changing this after the
	 * composable runs has no effect (the machine is created once). To reconfigure,
	 * remount the component with a new `key`.
	 *
	 * Must be structured-cloneable and nested Vue reactivity is stripped: the
	 * machine deep-clones via `structuredClone`, so pass plain serializable form
	 * data (no functions, symbols, or class instances).
	 */
	initialData: T;
	/**
	 * Read ONCE at setup and captured — NOT reactive. Changing this after the
	 * composable runs has no effect (the machine is created once). To reconfigure,
	 * remount the component with a new `key`.
	 */
	context?: WizardContext;
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	onError?: (error: Error) => void;
	/**
	 * Plugins registered once at machine creation (reference-stable — read once,
	 * NOT reactive). Define them outside setup or hoist them.
	 */
	plugins?: WizardPlugin<T>[];
}

/**
 * State slice - current step and data
 * All values are ComputedRef since they are derived from reactive state
 */
export interface UseWizardState<T extends WizardData> {
	currentStepId: ComputedRef<StepId>;
	currentStep: ComputedRef<WizardStepDefinition<T>>;
	data: ComputedRef<T>;
	isCompleted: ComputedRef<boolean>;
	stepStatuses: ComputedRef<Record<StepId, StepStatus>>;
	progress: ComputedRef<WizardProgress>;
}

/**
 * Validation slice - validation state and errors
 * All values are ComputedRef since they are derived from reactive state
 */
export interface UseWizardValidation {
	isValid: ComputedRef<boolean>;
	validationErrors: ComputedRef<ValidationState["validationErrors"]>;
}

/**
 * Navigation slice - step navigation capabilities
 * All values are ComputedRef since they are derived from reactive state
 */
export interface UseWizardNavigationState {
	canGoNext: ComputedRef<boolean>;
	canGoPrevious: ComputedRef<boolean>;
	canGoBack: ComputedRef<boolean>;
	isFirstStep: ComputedRef<boolean>;
	isLastStep: ComputedRef<boolean>;
	visitedSteps: ComputedRef<StepId[]>;
	availableSteps: ComputedRef<StepId[]>;
	stepHistory: ComputedRef<StepId[]>;
}

/**
 * Navigation slice - step navigation methods
 */
export interface UseWizardNavigationActions {
	goNext: () => Promise<void>;
	goPrevious: () => Promise<void>;
	/**
	 * @deprecated Use `goPrevious()` instead. `goBack(1)` is equivalent;
	 * for multiple steps call `goPrevious()` repeatedly.
	 */
	goBack: (steps?: number) => Promise<void>;
	goTo: (stepId: StepId, options?: GoToOptions) => Promise<void>;
	/** @deprecated Use goTo(stepId) instead */
	goToStep: (stepId: StepId) => Promise<void>;
}

export type UseWizardNavigation = UseWizardNavigationState &
	UseWizardNavigationActions;

/**
 * Loading slice - async operation states
 * All values are ComputedRef since they are derived from reactive state
 */
export interface UseWizardLoading {
	isValidating: ComputedRef<boolean>;
	isSubmitting: ComputedRef<boolean>;
	isNavigating: ComputedRef<boolean>;
}

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
/** Dry-run validators on every enabled step (see `actions.validateAll`). */
export type ValidateAllFn = (options?: {
	updateStatuses?: boolean;
}) => Promise<ValidationSummary>;
export type CanSubmitFn = () => Promise<boolean>;
export type SubmitFn = () => Promise<void>;
export type ResetFn<T extends WizardData> = (data?: T) => void;
/** Abandon the wizard: await onCancel handlers, then reset. */
export type CancelFn = () => Promise<void>;
export type SerializeFn<T extends WizardData> = () => WizardSerializedState<T>;
export type RestoreFn<T extends WizardData> = (
	state: WizardSerializedState<T>,
) => void;

/**
 * Actions slice - data mutations and validation
 */
export interface UseWizardActions<T extends WizardData> {
	updateData: UpdateDataFn<T>;
	setData: SetDataFn<T>;
	updateField: UpdateFieldFn<T>;
	validate: ValidateFn;
	validateAll: ValidateAllFn;
	canSubmit: CanSubmitFn;
	submit: SubmitFn;
	reset: ResetFn<T>;
	cancel: CancelFn;
	serialize: SerializeFn<T>;
	restore: RestoreFn<T>;
}

/**
 * Complete wizard return value with organized concerns
 */
export interface UseWizardReturn<T extends WizardData> {
	state: UseWizardState<T>;
	validation: UseWizardValidation;
	navigation: UseWizardNavigation;
	loading: UseWizardLoading;
	actions: UseWizardActions<T>;
}
