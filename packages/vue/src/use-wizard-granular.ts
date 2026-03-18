import type { WizardData } from "@gooonzick/wizard-core";
import { computed, type Ref } from "vue";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardReturn,
	UseWizardState,
	UseWizardValidation,
} from "./types";
import { useWizardProviderContext } from "./wizard-provider";

function resolveWizardFieldBinding<T extends WizardData>(
	wizard?: UseWizardReturn<T>,
): UseWizardReturn<T> {
	if (wizard) {
		return wizard;
	}

	return useWizardProviderContext<T>().wizard;
}

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

/**
 * Writable field binding backed by the wizard machine.
 * Reads from wizard state and writes through `updateField()`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const email = useWizardField<{ email: string }, "email">("email");
 * </script>
 *
 * <template>
 *   <input v-model="email" />
 * </template>
 * ```
 */
export function useWizardField<T extends WizardData, K extends keyof T>(
	field: K,
): Ref<T[K]>;

/**
 * Writable field binding for direct `useWizard()` consumers.
 *
 * @example
 * ```ts
 * const wizard = useWizard({ definition, initialData });
 * const email = useWizardField(wizard, "email");
 * ```
 */
export function useWizardField<T extends WizardData, K extends keyof T>(
	wizard: UseWizardReturn<T>,
	field: K,
): Ref<T[K]>;

export function useWizardField<T extends WizardData, K extends keyof T>(
	fieldOrWizard: K | UseWizardReturn<T>,
	maybeField?: K,
) {
	const wizard =
		maybeField === undefined
			? resolveWizardFieldBinding<T>()
			: resolveWizardFieldBinding(fieldOrWizard as UseWizardReturn<T>);
	const field = maybeField === undefined ? (fieldOrWizard as K) : maybeField;

	return computed<T[K]>({
		get: () => wizard.state.data.value[field],
		set: (value) => {
			wizard.actions.updateField(field, value);
		},
	});
}
