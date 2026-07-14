import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
	WizardState,
} from "@gooonzick/wizard-core";
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
		onCancel,
		onReset,
		onError,
		plugins,
	} = options;

	// Callbacks captured once at setup time (composables run once per component)
	const callbacks = {
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onCancel,
		onReset,
		onError,
	};

	// Forward reference for state - needed for createMachine callback
	let stateRef: { value: WizardState<T> };
	// Forward reference for manager - needed to route onStateChange to channels
	let managerRef: WizardStateManager<T> | null = null;

	// Factory function to create machine with proper events
	const createMachine = (data?: T): WizardMachine<T> => {
		return new WizardMachine(
			definition,
			context,
			data || initialData,
			{
				onStateChange: (newState: WizardState<T>) => {
					// The machine fires this synchronously from its constructor
					// (initializeFirstStep) before `stateRef`/`managerRef` are wired up.
					// The initial snapshot is read directly below, so skip these early
					// notifications instead of writing through an undefined ref.
					if (!stateRef) {
						return;
					}
					const oldState = stateRef.value;
					stateRef.value = newState;
					// Route the change to the manager's navigation/validation channels so
					// async follow-up notifications (e.g. after reset/cancel/restore
					// onEnter/validate) refresh navigation state in the view.
					if (oldState && managerRef) {
						managerRef.handleStateChange(newState, oldState);
					}
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
				onCancel: async (d: T) => {
					await callbacks.onCancel?.(d);
				},
				onReset: () => {
					callbacks.onReset?.();
				},
				onError: (error: Error) => {
					callbacks.onError?.(error);
				},
			},
			plugins,
		);
	};

	// Initialize machine and manager immediately (not as shallowRef with null)
	const initialMachine = createMachine();
	const initialManager = new WizardStateManager(
		initialMachine,
		definition.initialStepId,
	);
	managerRef = initialManager;

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
		canGoBack: false,
		isFirstStep: false,
		isLastStep: false,
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
			navigationState.canGoBack = nav.canGoBack ?? false;
			navigationState.isFirstStep = nav.isFirstStep ?? false;
			navigationState.isLastStep = nav.isLastStep ?? false;
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

	// Subscribe to navigation channel so we pick up async computation results
	// (the manager resolves canGoNext/canGoPrevious asynchronously)
	const unsubscribeNavigation = manager.value.subscribe(() => {
		updateNavigationState();
	}, "navigation");

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
		unsubscribeNavigation();
		// WIZ-007: tear down plugins (machine.destroy via the manager). Isolated
		// rejections are handled internally — fire-and-forget here.
		void manager.value.destroy();
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
	const isFirstStep = computed(() => navigationState.isFirstStep);
	const isLastStep = computed(() => navigationState.isLastStep);

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

	const validateAll = async (options?: { updateStatuses?: boolean }) => {
		loadingState.isValidating = true;
		try {
			return await machine.value.validateAll(options);
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

	const goTo = async (stepId: StepId, options?: GoToOptions) => {
		loadingState.isNavigating = true;
		try {
			await machine.value.goTo(stepId, options);
		} finally {
			loadingState.isNavigating = false;
		}
	};

	/** @deprecated Use goTo instead */
	const goToStep = async (stepId: StepId) => {
		return goTo(stepId, { skipValidation: true });
	};

	// NOTE (loading semantics): reset/cancel/restore call the machine directly and
	// mirror the loading flags on this local `loadingState` reactive, rather than
	// routing through `manager.runReset`/`runCancel`/`runRestore`. The shared
	// `WizardStateManager.getLoadingSnapshot()` therefore reflects React's binding
	// but NOT Vue's. In Vue, read loading via the composable's `loading` slice, not
	// the manager.
	const reset = (data?: T) => {
		loadingState.isValidating = false;
		loadingState.isSubmitting = false;
		loadingState.isNavigating = false;
		machine.value.reset(data);
		// onStateChange (sync + async follow-up) drives state.value; refresh nav
		// to mirror the synchronous reset snapshot immediately.
		state.value = machine.value.snapshot;
		updateNavigationState();
	};

	const cancel = async () => {
		loadingState.isNavigating = true;
		try {
			await machine.value.cancel();
		} finally {
			loadingState.isValidating = false;
			loadingState.isSubmitting = false;
			loadingState.isNavigating = false;
			// onStateChange drives state.value; refresh nav from the reset snapshot.
			state.value = machine.value.snapshot;
			updateNavigationState();
		}
	};

	const serialize = () => {
		return machine.value.serialize();
	};

	const restore = (serializedState: WizardSerializedState<T>) => {
		loadingState.isValidating = false;
		loadingState.isSubmitting = false;
		loadingState.isNavigating = false;
		machine.value.restore(serializedState);
		// onStateChange drives state.value; refresh nav from the restored snapshot.
		state.value = machine.value.snapshot;
		updateNavigationState();
	};

	// Build organized return value
	const stateSlice: UseWizardState<T> = {
		currentStepId: computed(() => state.value.currentStepId),
		currentStep,
		data: computed(() => state.value.data) as ComputedRef<T>,
		isCompleted: computed(() => state.value.isCompleted),
		stepStatuses: computed(() => state.value.stepStatuses),
		progress: computed(() => state.value.progress),
	};

	const validationSlice: UseWizardValidation = {
		isValid: computed(() => state.value.isValid),
		validationErrors: computed(() => state.value.validationErrors),
	};

	const navigationSlice: UseWizardNavigation = {
		canGoNext: computed(() => navigationState.canGoNext),
		canGoPrevious: computed(() => navigationState.canGoPrevious),
		canGoBack: computed(() => navigationState.canGoBack),
		isFirstStep,
		isLastStep,
		visitedSteps,
		availableSteps: computed(() => navigationState.availableSteps),
		stepHistory,
		goNext,
		goPrevious,
		goBack,
		goTo,
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
		validateAll,
		canSubmit,
		submit,
		reset,
		cancel,
		serialize,
		restore,
	};

	return {
		state: stateSlice,
		validation: validationSlice,
		navigation: navigationSlice,
		loading: loadingSlice,
		actions: actionsSlice,
	};
}
