import type { WizardData } from "@wizard/core";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardState,
	UseWizardValidation,
} from "./types";
import { useWizardProviderContext } from "./wizard-provider";

/**
 * Composable for wizard data state
 * Only triggers re-renders when data or current step changes
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { data, currentStepId, currentStep } = useWizardData<MyFormData>();
 * </script>
 * ```
 */
export function useWizardData<T extends WizardData>(): UseWizardState<T> {
	const { wizard } = useWizardProviderContext<T>();
	return wizard.state;
}

/**
 * Composable for navigation state and methods
 * Only triggers re-renders when navigation state changes
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { canGoNext, goNext, canGoPrevious, goPrevious } = useWizardNavigation();
 * </script>
 * ```
 */
export function useWizardNavigation(): UseWizardNavigation {
	const { wizard } = useWizardProviderContext();
	return wizard.navigation;
}

/**
 * Composable for validation state
 * Only triggers re-renders when validation state changes
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isValid, validationErrors } = useWizardValidation();
 * </script>
 * ```
 */
export function useWizardValidation(): UseWizardValidation {
	const { wizard } = useWizardProviderContext();
	return wizard.validation;
}

/**
 * Composable for loading states
 * Only triggers re-renders when loading states change
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isValidating, isSubmitting, isNavigating } = useWizardLoading();
 * </script>
 * ```
 */
export function useWizardLoading(): UseWizardLoading {
	const { wizard } = useWizardProviderContext();
	return wizard.loading;
}

/**
 * Composable for wizard actions
 * Combines data mutations and submission in one place
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { updateField, submit, reset } = useWizardActions<MyFormData>();
 * </script>
 * ```
 */
export function useWizardActions<T extends WizardData>(): UseWizardActions<T> {
	const { wizard } = useWizardProviderContext<T>();
	return wizard.actions;
}
