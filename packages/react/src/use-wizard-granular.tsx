import type { WizardData } from "@gooonzick/wizard-core";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
	pickDataActions,
	pickNavigationActions,
	type UseWizardActions,
	type UseWizardLoading,
	type UseWizardNavigation,
	type UseWizardReturn,
	type UseWizardState,
	type UseWizardValidation,
} from "./use-wizard";
import {
	useWizardInternalContext,
	useWizardProviderContext,
} from "./wizard-provider";

/**
 * Hook for wizard data state
 * Only re-renders when data or current step changes (subscribes to 'state' channel)
 *
 * @example
 * ```tsx
 * const { data, currentStepId, currentStep } = useWizardData<MyFormData>();
 * ```
 */
export function useWizardData<T extends WizardData>(): UseWizardState<T> {
	const { manager } = useWizardProviderContext<T>();

	const stateSnapshot = useSyncExternalStore(
		useCallback((callback) => manager.subscribe(callback, "state"), [manager]),
		useCallback(() => manager.getStateSnapshot(), [manager]),
		useCallback(() => manager.getStateSnapshot(), [manager]),
	);

	return useMemo(
		() => ({
			currentStepId: stateSnapshot.currentStepId,
			currentStep: stateSnapshot.currentStep,
			data: stateSnapshot.data,
			isCompleted: stateSnapshot.isCompleted,
			stepStatuses: stateSnapshot.stepStatuses,
			progress: stateSnapshot.progress,
		}),
		[
			stateSnapshot.currentStepId,
			stateSnapshot.currentStep,
			stateSnapshot.data,
			stateSnapshot.isCompleted,
			stateSnapshot.stepStatuses,
			stateSnapshot.progress,
		],
	);
}

/**
 * Hook for navigation state and methods
 * Only re-renders when navigation state changes (subscribes to 'navigation' channel)
 *
 * @example
 * ```tsx
 * const { canGoNext, goNext, canGoPrevious, goPrevious } = useWizardNavigation();
 * ```
 */
export function useWizardNavigation(): UseWizardNavigation {
	// The provider's shared action set: navigation holds the reference-counted
	// "isNavigating" flag, identical to useWizard's navigation methods.
	const { manager, actions } = useWizardInternalContext();

	const navigationSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "navigation"),
			[manager],
		),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
	);

	return useMemo(
		() => ({
			canGoNext: navigationSnapshot.canGoNext,
			canGoPrevious: navigationSnapshot.canGoPrevious,
			canGoBack: navigationSnapshot.canGoBack,
			isFirstStep: navigationSnapshot.isFirstStep,
			isLastStep: navigationSnapshot.isLastStep,
			visitedSteps: navigationSnapshot.visitedSteps,
			availableSteps: navigationSnapshot.availableSteps,
			stepHistory: navigationSnapshot.stepHistory,
			...pickNavigationActions(actions),
		}),
		[
			navigationSnapshot.canGoNext,
			navigationSnapshot.canGoPrevious,
			navigationSnapshot.canGoBack,
			navigationSnapshot.isFirstStep,
			navigationSnapshot.isLastStep,
			navigationSnapshot.visitedSteps,
			navigationSnapshot.availableSteps,
			navigationSnapshot.stepHistory,
			actions,
		],
	);
}

/**
 * Hook for validation state
 * Only re-renders when validation state changes (subscribes to 'validation' channel)
 *
 * @example
 * ```tsx
 * const { isValid, validationErrors } = useWizardValidation();
 * ```
 */
export function useWizardValidation(): UseWizardValidation {
	const { manager } = useWizardProviderContext();

	const validationSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "validation"),
			[manager],
		),
		useCallback(() => manager.getValidationSnapshot(), [manager]),
		useCallback(() => manager.getValidationSnapshot(), [manager]),
	);

	return useMemo(
		() => ({
			isValid: validationSnapshot.isValid,
			validationErrors: validationSnapshot.validationErrors,
		}),
		[validationSnapshot.isValid, validationSnapshot.validationErrors],
	);
}

/**
 * Hook for loading states
 * Only re-renders when loading states change (subscribes to 'loading' channel)
 *
 * @example
 * ```tsx
 * const { isValidating, isSubmitting, isNavigating } = useWizardLoading();
 * ```
 */
export function useWizardLoading(): UseWizardLoading {
	const { manager } = useWizardProviderContext();

	const loadingSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "loading"),
			[manager],
		),
		useCallback(() => manager.getLoadingSnapshot(), [manager]),
		useCallback(() => manager.getLoadingSnapshot(), [manager]),
	);

	return useMemo(
		() => ({
			isValidating: loadingSnapshot.isValidating,
			isSubmitting: loadingSnapshot.isSubmitting,
			isNavigating: loadingSnapshot.isNavigating,
		}),
		[
			loadingSnapshot.isValidating,
			loadingSnapshot.isSubmitting,
			loadingSnapshot.isNavigating,
		],
	);
}

/**
 * Hook for wizard actions
 * Does not subscribe to any channel - actions are stable references
 *
 * @example
 * ```tsx
 * const { updateField, submit, reset } = useWizardActions<MyFormData>();
 * ```
 */
export function useWizardActions<T extends WizardData>(): UseWizardActions<T> {
	// Picked from the provider's single action set (one per manager), so the
	// identities are stable and `reset`/`restore` failures reach the provider's
	// current `onError`.
	const { actions } = useWizardInternalContext<T>();
	return useMemo(() => pickDataActions(actions), [actions]);
}

/**
 * Controlled-input binding for a single wizard field.
 * Returns a `[value, setValue]` tuple. React has no two-way-binding primitive,
 * so this is the analogue of Vue's `useWizardField` (which returns a WritableComputedRef).
 *
 * Provider mode (inside <WizardProvider>):
 *   const [name, setName] = useWizardField<MyData, "name">("name");
 * Direct mode (with a useWizard() return):
 *   const wizard = useWizard({ definition, initialData });
 *   const [name, setName] = useWizardField(wizard, "name");
 *
 * Hooks-rules caveat: a single call site must not switch between the two styles
 * across renders (the provider-mode branch calls hooks). Pick one style per call
 * site — the same contract Vue's `useWizardField` carries.
 */
export function useWizardField<T extends WizardData, K extends keyof T>(
	field: K,
): [T[K], (value: T[K]) => void];
export function useWizardField<T extends WizardData, K extends keyof T>(
	wizard: UseWizardReturn<T>,
	field: K,
): [T[K], (value: T[K]) => void];
export function useWizardField<T extends WizardData, K extends keyof T>(
	fieldOrWizard: K | UseWizardReturn<T>,
	maybeField?: K,
): [T[K], (value: T[K]) => void] {
	if (maybeField === undefined) {
		// Provider mode — compose the granular hooks (both consume the shared manager).
		// A single call site always uses one style (chosen by argument count), so the
		// hook order is stable per call site even though the branches call hooks. See
		// the JSDoc contract above.
		const field = fieldOrWizard as K;
		// biome-ignore lint/correctness/useHookAtTopLevel: call site uses exactly one style; order is stable
		const { data } = useWizardData<T>();
		// biome-ignore lint/correctness/useHookAtTopLevel: call site uses exactly one style; order is stable
		const { updateField } = useWizardActions<T>();
		// biome-ignore lint/correctness/useHookAtTopLevel: call site uses exactly one style; order is stable
		const setValue = useCallback(
			(value: T[K]) => updateField(field, value),
			[updateField, field],
		);
		return [data[field], setValue];
	}
	// Direct mode — read the passed useWizard() return.
	const wizard = fieldOrWizard as UseWizardReturn<T>;
	const field = maybeField;
	// biome-ignore lint/correctness/useHookAtTopLevel: call site uses exactly one style; order is stable
	const setValue = useCallback(
		(value: T[K]) => wizard.actions.updateField(field, value),
		[wizard, field],
	);
	return [wizard.state.data[field], setValue];
}
