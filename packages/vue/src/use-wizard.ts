import type { StepId, WizardData, WizardState } from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import {
	type ComputedRef,
	computed,
	onScopeDispose,
	reactive,
	shallowRef,
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

	// Callbacks captured once at setup time (composables run once per component)
	const callbacks = {
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
				callbacks.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, d: T) => {
				callbacks.onStepEnter?.(stepId, d);
			},
			onStepLeave: (stepId: StepId, d: T) => {
				callbacks.onStepLeave?.(stepId, d);
			},
			onComplete: (d: T) => {
				callbacks.onComplete?.(d);
			},
			onError: (error: Error) => {
				callbacks.onError?.(error);
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
			callbacks.onError?.(
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

	// Computed values derived from reactive state
	// These access state.value.currentStepId to establish a reactive dependency,
	// then delegate to manager for the actual lookup (manager methods are not reactive).
	const currentStep = computed(() => {
		const stepId = state.value.currentStepId;
		return definition.steps[stepId];
	});
	const visitedSteps = computed(() => {
		// Re-evaluate when step changes; manager tracks visited set internally
		void state.value.currentStepId;
		return manager.value.getVisitedSteps();
	});
	const stepHistory = computed(() => {
		// Re-evaluate when step changes; manager tracks history internally
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
		canGoNext: computed(() => navigationState.canGoNext),
		canGoPrevious: computed(() => navigationState.canGoPrevious),
		isFirstStep,
		isLastStep,
		visitedSteps,
		availableSteps: computed(() => navigationState.availableSteps),
		stepHistory,
		goNext,
		goPrevious,
		goBack,
		goToStep,
	};

	const loadingSlice: UseWizardLoading = {
		isValidating: computed(() => loadingState.isValidating),
		isSubmitting: computed(() => loadingState.isSubmitting),
		isNavigating: computed(() => loadingState.isNavigating),
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
