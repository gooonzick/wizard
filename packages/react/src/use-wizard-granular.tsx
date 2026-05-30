import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
} from "@gooonzick/wizard-core";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardState,
	UseWizardValidation,
} from "./use-wizard";
import { useWizardProviderContext } from "./wizard-provider";

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
	const { manager } = useWizardProviderContext();

	const navigationSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "navigation"),
			[manager],
		),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
	);

	// Navigation actions with loading state management
	const goNext = useCallback(async () => {
		manager.setLoadingState({ isNavigating: true });
		try {
			await manager.getMachine().goNext();
		} finally {
			manager.setLoadingState({ isNavigating: false });
		}
	}, [manager]);

	const goPrevious = useCallback(async () => {
		manager.setLoadingState({ isNavigating: true });
		try {
			await manager.getMachine().goPrevious();
		} finally {
			manager.setLoadingState({ isNavigating: false });
		}
	}, [manager]);

	const goBack = useCallback(
		async (steps = 1) => {
			manager.setLoadingState({ isNavigating: true });
			try {
				await manager.getMachine().goBack(steps);
			} finally {
				manager.setLoadingState({ isNavigating: false });
			}
		},
		[manager],
	);

	const goTo = useCallback(
		async (stepId: StepId, options?: GoToOptions) => {
			manager.setLoadingState({ isNavigating: true });
			try {
				await manager.getMachine().goTo(stepId, options);
			} finally {
				manager.setLoadingState({ isNavigating: false });
			}
		},
		[manager],
	);

	/** @deprecated Use goTo instead */
	const goToStep = useCallback(
		async (stepId: StepId) => {
			return goTo(stepId, { skipValidation: true });
		},
		[goTo],
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
			goNext,
			goPrevious,
			goBack,
			goTo,
			goToStep,
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
			goNext,
			goPrevious,
			goBack,
			goTo,
			goToStep,
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
	const { manager, initialData } = useWizardProviderContext<T>();

	const updateData = useCallback(
		(updater: (data: T) => T) => {
			manager.getMachine().updateData(updater);
		},
		[manager],
	);

	const setData = useCallback(
		(data: T) => {
			manager.getMachine().setData(data);
		},
		[manager],
	);

	const updateField = useCallback(
		<K extends keyof T>(field: K, value: T[K]) => {
			updateData((data: T) => ({
				...data,
				[field]: value,
			}));
		},
		[updateData],
	);

	const validate = useCallback(async () => {
		manager.setLoadingState({ isValidating: true });
		try {
			await manager.getMachine().validate();
		} finally {
			manager.setLoadingState({ isValidating: false });
		}
	}, [manager]);

	const canSubmit = useCallback(async (): Promise<boolean> => {
		return manager.getMachine().canSubmit();
	}, [manager]);

	const submit = useCallback(async () => {
		manager.setLoadingState({ isSubmitting: true });
		try {
			await manager.getMachine().submit();
		} finally {
			manager.setLoadingState({ isSubmitting: false });
		}
	}, [manager]);

	const reset = useCallback(
		(data?: T) => {
			void manager.runReset(data ?? initialData);
		},
		[manager, initialData],
	);

	const cancel = useCallback(async () => {
		await manager.runCancel();
	}, [manager]);

	const serialize = useCallback(() => {
		return manager.getMachine().serialize();
	}, [manager]);

	const restore = useCallback(
		(serializedState: WizardSerializedState<T>) => {
			void manager.runRestore(serializedState);
		},
		[manager],
	);

	return useMemo(
		() => ({
			updateData,
			setData,
			updateField,
			validate,
			canSubmit,
			submit,
			reset,
			cancel,
			serialize,
			restore,
		}),
		[
			updateData,
			setData,
			updateField,
			validate,
			canSubmit,
			submit,
			reset,
			cancel,
			serialize,
			restore,
		],
	);
}
