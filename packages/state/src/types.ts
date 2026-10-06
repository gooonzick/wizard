import type {
	StepId,
	StepStatus,
	WizardData,
	WizardProgress,
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
	canGoBack: boolean;
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
 * Loading flags. `isValidating` / `isSubmitting` / `isNavigating` are UI flags
 * owned by the manager; `isLoadingStep` mirrors the machine.
 */
export interface LoadingState {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
	/**
	 * WIZ-013: a lazy step implementation is loading. Mirrors
	 * `machine.snapshot.isLoadingStep` (owned by the machine, not by
	 * `trackLoading()`).
	 */
	isLoadingStep: boolean;
}

/** Loading flags owned by the manager's reference-counted `trackLoading()`. */
export type TrackedLoadingFlag = Exclude<keyof LoadingState, "isLoadingStep">;

/**
 * State snapshot interface for wizard state
 */
export interface StateSnapshot<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
	stepStatuses: Record<StepId, StepStatus>;
	progress: WizardProgress;
}

/**
 * Listener type for subscription callbacks
 */
export type SubscriptionListener = () => void;

/**
 * Options for {@link WizardStateManager}.
 */
export interface WizardStateManagerOptions {
	/**
	 * Receives errors the manager catches itself — currently failures of the
	 * background navigation recompute (a throwing user guard / transition
	 * resolver). When omitted they are logged with `console.error`.
	 */
	onError?: (error: Error) => void;
}
