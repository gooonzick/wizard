// Internal (for advanced use)
export {
	type NavigationState,
	WizardStateManager,
} from "./internal/wizard-state-manager";

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
	useWizardProviderContext,
	WizardProvider,
	type WizardProviderProps,
} from "./wizard-provider";
