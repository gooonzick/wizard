import type {
	StepId,
	WizardData,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";

/**
 * Subscription channels for fine-grained re-renders
 */
export type SubscriptionChannel =
	| "state"
	| "navigation"
	| "validation"
	| "loading"
	| "all";

/**
 * Navigation state computed from wizard machine
 */
export interface NavigationState {
	canGoNext: boolean;
	canGoPrevious: boolean;
	availableSteps: StepId[];
	isFirstStep: boolean;
	isLastStep: boolean;
	visitedSteps: StepId[];
	stepHistory: StepId[];
}

/**
 * Validation state slice
 */
export interface ValidationState {
	isValid: boolean;
	validationErrors?: Record<string, string>;
}

/**
 * Loading state slice (UI concerns managed by state manager, not core machine)
 */
export interface LoadingState {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
}

/**
 * State snapshot interface for wizard state
 */
export interface StateSnapshot<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
}

/**
 * Listener type for subscription callbacks
 */
export type SubscriptionListener = () => void;
