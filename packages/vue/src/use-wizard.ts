import type { StepId, WizardData, WizardState } from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import {
	type ComputedRef,
	computed,
	onScopeDispose,
	reactive,
	readonly,
	ref,
	shallowRef,
	toRefs,
	watch,
} from "vue";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardOptions,
	UseWizardReturn,
	UseWizardState,
	UseWizardValidation,
} from "./types";

/**
 * Vue composable for wizard state management
 * Returns organized state slices with reactive refs and computed values
 */
export function useWizard<T extends WizardData>(
	options: UseWizardOptions<T>,
): UseWizardReturn<T> {
	const {
		definition,
		initialData,
		context = {},
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onError,
	} = options;

	// Store callbacks in a ref for stable references (simpler than reactive + watchEffect)
	const callbacksRef = ref({
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onError,
	});

	// Update callbacks synchronously when options change
	callbacksRef.value = {
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onError,
	};

	// Forward reference for state - needed for createMachine callback
	let stateRef: { value: WizardState<T> };

	// Factory function to create machine with proper events
	const createMachine = (data?: T): WizardMachine<T> => {
		return new WizardMachine(definition, context, data || initialData, {
			onStateChange: (newState: WizardState<T>) => {
				stateRef.value = newState;
				callbacksRef.value.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, d: T) => {
				callbacksRef.value.onStepEnter?.(stepId, d);
			},
			onStepLeave: (stepId: StepId, d: T) => {
				callbacksRef.value.onStepLeave?.(stepId, d);
			},
			onComplete: (d: T) => {
				callbacksRef.value.onComplete?.(d);
			},
			onError: (error: Error) => {
				callbacksRef.value.onError?.(error);
			},
		});
	};

	// Initialize machine and manager immediately (not as shallowRef with null)
	const initialMachine = createMachine();
	const initialManager = new WizardStateManager(
		initialMachine,
		definition.initialStepId,
	);

	// Create wizard machine and manager in shallow refs to avoid deep reactivity on functions
	const machine = shallowRef<WizardMachine<T>>(initialMachine);
	const manager = shallowRef<WizardStateManager<T>>(initialManager);

	// Initialize state with actual value from manager (use shallowRef to avoid unwrapping issues)
	const state = shallowRef<WizardState<T>>(manager.value.getSnapshot());
	stateRef = state as { value: WizardState<T> };

	// Navigation state
	const navigationState = reactive({
		canGoNext: false,
		canGoPrevious: false,
		availableSteps: [] as StepId[],
	});

	// Loading state
	const loadingState = reactive({
		isValidating: false,
		isSubmitting: false,
		isNavigating: false,
	});

	// Update navigation state
	const updateNavigationState = () => {
		try {
			const nav = manager.value.getNavigationSnapshot();
			navigationState.canGoNext = nav.canGoNext ?? false;
			navigationState.canGoPrevious = nav.canGoPrevious ?? false;
			navigationState.availableSteps = nav.availableSteps ?? [];
		} catch (error) {
			// Log error for debugging when debug flag is enabled
			if (context.debug) {
				console.error("[useWizard] Failed to update navigation state:", error);
			}
			callbacksRef.value.onError?.(
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	};

	// Initialize navigation state
	updateNavigationState();

	// Watch for step changes and update navigation (with cleanup)
	const stopStepWatcher = watch(
		() => state.value.currentStepId,
		() => {
			updateNavigationState();
		},
	);

	// Cleanup on scope dispose (component unmount)
	onScopeDispose(() => {
		stopStepWatcher();
	});

	// Computed values - depend on state.value to ensure reactivity
	const currentStep = computed(() => {
		// Access state.value.currentStepId to track dependency (void to suppress unused warning)
		void state.value.currentStepId;
		return manager.value.getCurrentStep();
	});
	const visitedSteps = computed(() => {
		// Access state.value.currentStepId to track dependency
		void state.value.currentStepId;
		return manager.value.getVisitedSteps();
	});
	const stepHistory = computed(() => {
		// Access state.value.currentStepId to track dependency
		void state.value.currentStepId;
		return manager.value.getStepHistory();
	});
	const isFirstStep = computed(
		() => state.value.currentStepId === definition.initialStepId,
	);
	const isLastStep = computed(() => !navigationState.canGoNext);

	// Data mutations
	const updateData = (updater: (data: T) => T) => {
		machine.value.updateData(updater);
		updateNavigationState();
	};

	const setData = (data: T) => {
		machine.value.setData(data);
		updateNavigationState();
	};

	const updateField = <K extends keyof T>(field: K, value: T[K]) => {
		updateData((data: T) => ({
			...data,
			[field]: value,
		}));
		// updateNavigationState() is already called in updateData
	};

	// Validation
	const validate = async () => {
		loadingState.isValidating = true;
		try {
			await machine.value.validate();
		} finally {
			loadingState.isValidating = false;
		}
	};

	const canSubmit = async (): Promise<boolean> => {
		return machine.value.canSubmit();
	};

	const submit = async () => {
		loadingState.isSubmitting = true;
		try {
			await machine.value.submit();
		} finally {
			loadingState.isSubmitting = false;
		}
	};

	// Navigation
	const goNext = async () => {
		loadingState.isNavigating = true;
		try {
			await machine.value.goNext();
		} finally {
			loadingState.isNavigating = false;
		}
	};

	const goPrevious = async () => {
		loadingState.isNavigating = true;
		try {
			await machine.value.goPrevious();
		} finally {
			loadingState.isNavigating = false;
		}
	};

	const goBack = async (steps = 1) => {
		loadingState.isNavigating = true;
		try {
			await machine.value.goBack(steps);
		} finally {
			loadingState.isNavigating = false;
		}
	};

	const goToStep = async (stepId: StepId) => {
		loadingState.isNavigating = true;
		try {
			await machine.value.goToStep(stepId);
		} finally {
			loadingState.isNavigating = false;
		}
	};

	const reset = (data?: T) => {
		// Create new machine and manager instances
		machine.value = createMachine(data);
		manager.value = new WizardStateManager(
			machine.value,
			definition.initialStepId,
		);

		// Update state and navigation
		state.value = machine.value.snapshot;
		updateNavigationState();
	};

	// Build organized return value
	const stateSlice: UseWizardState<T> = {
		currentStepId: computed(() => state.value.currentStepId),
		currentStep,
		data: computed(() => state.value.data) as ComputedRef<T>,
		isCompleted: computed(() => state.value.isCompleted),
	};

	const validationSlice: UseWizardValidation = {
		isValid: computed(() => state.value.isValid),
		validationErrors: computed(() => state.value.validationErrors),
	};

	const navigationSlice: UseWizardNavigation = {
		canGoNext: readonly(
			toRefs(navigationState).canGoNext,
		) as ComputedRef<boolean>,
		canGoPrevious: readonly(
			toRefs(navigationState).canGoPrevious,
		) as ComputedRef<boolean>,
		isFirstStep,
		isLastStep,
		visitedSteps,
		availableSteps: readonly(
			toRefs(navigationState).availableSteps,
		) as ComputedRef<StepId[]>,
		stepHistory,
		goNext,
		goPrevious,
		goBack,
		goToStep,
	};

	const loadingSlice: UseWizardLoading = {
		isValidating: readonly(
			toRefs(loadingState).isValidating,
		) as ComputedRef<boolean>,
		isSubmitting: readonly(
			toRefs(loadingState).isSubmitting,
		) as ComputedRef<boolean>,
		isNavigating: readonly(
			toRefs(loadingState).isNavigating,
		) as ComputedRef<boolean>,
	};

	const actionsSlice: UseWizardActions<T> = {
		updateData,
		setData,
		updateField,
		validate,
		canSubmit,
		submit,
		reset,
	};

	return {
		state: stateSlice,
		validation: validationSlice,
		navigation: navigationSlice,
		loading: loadingSlice,
		actions: actionsSlice,
	};
}
