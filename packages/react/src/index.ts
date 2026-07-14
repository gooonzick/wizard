// Internal (for advanced use)
// Re-export from state package for convenience

export type {
	WizardProgress,
	WizardSerializedState,
} from "@gooonzick/wizard-core";
export { WizardRestoreError } from "@gooonzick/wizard-core";
export {
	type LoadingState,
	type NavigationState,
	type StateSnapshot,
	type SubscriptionChannel,
	type ValidationState,
	WizardStateManager,
} from "@gooonzick/wizard-state";
export {
	type CancelFn,
	type CanSubmitFn,
	type ResetFn,
	type RestoreFn,
	type SerializeFn,
	type SetDataFn,
	type SubmitFn,
	// Helper types for individual actions
	type UpdateDataFn,
	type UpdateFieldFn,
	type UseWizardActions,
	type UseWizardLoading,
	type UseWizardNavigation,
	type UseWizardOptions,
	type UseWizardReturn,
	type UseWizardState,
	type UseWizardValidation,
	useWizard,
	type ValidateAllFn,
	type ValidateFn,
} from "./use-wizard";

// Granular hooks for fine-grained subscriptions
export {
	useWizardActions,
	useWizardData,
	useWizardField,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
} from "./use-wizard-granular";
export {
	useWizardProviderContext,
	WizardProvider,
	type WizardProviderProps,
} from "./wizard-provider";
