import type {
	StepId,
	WizardContext,
	WizardData,
	WizardDefinition,
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
	definition: WizardDefinition<T>;
	initialData: T;
	context?: WizardContext;
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onError?: (error: Error) => void;
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
	goBack: (steps?: number) => Promise<void>;
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
export type CanSubmitFn = () => Promise<boolean>;
export type SubmitFn = () => Promise<void>;
export type ResetFn<T extends WizardData> = (data?: T) => void;

/**
 * Actions slice - data mutations and validation
 */
export interface UseWizardActions<T extends WizardData> {
	updateData: UpdateDataFn<T>;
	setData: SetDataFn<T>;
	updateField: UpdateFieldFn<T>;
	validate: ValidateFn;
	canSubmit: CanSubmitFn;
	submit: SubmitFn;
	reset: ResetFn<T>;
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
