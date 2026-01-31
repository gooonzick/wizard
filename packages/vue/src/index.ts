// Internal (for advanced use)
// Re-export from state package for convenience
export {
	type LoadingState,
	type NavigationState,
	type StateSnapshot,
	WizardStateManager,
} from "@gooonzick/wizard-state";

// Types from types.ts
export type {
	CanSubmitFn,
	ResetFn,
	SetDataFn,
	SubmitFn,
	UpdateDataFn,
	UpdateFieldFn,
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardNavigationActions,
	UseWizardNavigationState,
	UseWizardOptions,
	UseWizardReturn,
	UseWizardState,
	UseWizardValidation,
	ValidateFn,
} from "./types";

// Main composable
export { useWizard, useWizard as default } from "./use-wizard";

// Granular composables for fine-grained subscriptions
export {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
} from "./use-wizard-granular";

// Provider for context sharing
export {
	createTypedWizardProvider,
	useWizardProviderContext,
	WizardProvider,
	type WizardProviderProps,
} from "./wizard-provider";
