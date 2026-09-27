import type { WizardData, WizardState } from "@gooonzick/wizard-core";
import {
	createMachineAndManager,
	createWizardActions,
	type LoadingState,
	type NavigationState,
	type WizardCallbacks,
} from "@gooonzick/wizard-state";
import { type ComputedRef, computed, onScopeDispose, shallowRef } from "vue";
import { toRawDeep } from "./internal/to-raw-deep";
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
		context = {},
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onCancel,
		onReset,
		onError,
		onDataChange,
		plugins,
	} = options;

	// Raw machine state. Written on EVERY machine onStateChange emission
	// (including async follow-ups after reset/restore/validate), so everything
	// derived from it below stays current. Seeded from the manager once it is
	// built; constructor-time emissions land here too and are overwritten then.
	const state = shallowRef<WizardState<T>>(
		undefined as unknown as WizardState<T>,
	);

	// Callbacks are captured once at setup time (composables run once per
	// component). onStateChange is wrapped so the reactive `state` mirrors the
	// machine before the user callback runs.
	const callbacks: WizardCallbacks<T> = {
		onStateChange: (newState: WizardState<T>) => {
			state.value = newState;
			onStateChange?.(newState);
		},
		onStepEnter,
		onStepLeave,
		onComplete,
		onCancel,
		onReset,
		onError,
		onDataChange,
	};

	// The machine deep-clones data with `structuredClone`, which throws
	// DataCloneError on Vue proxies — accept ref()/reactive() form state by
	// unwrapping it to plain data first.
	const initialData = toRawDeep(options.initialData);

	const { manager } = createMachineAndManager<T>({
		definition,
		context,
		initialData,
		getCallbacks: () => callbacks,
		plugins,
	});

	state.value = manager.getSnapshot();

	// Navigation and loading mirror the manager's cached snapshots. The manager
	// replaces the snapshot object on every change, so a shallowRef suffices.
	const navigation = shallowRef<NavigationState>(
		manager.getNavigationSnapshot(),
	);
	const loading = shallowRef<LoadingState>(manager.getLoadingSnapshot());

	const unsubscribeNavigation = manager.subscribe(() => {
		navigation.value = manager.getNavigationSnapshot();
	}, "navigation");
	const unsubscribeLoading = manager.subscribe(() => {
		loading.value = manager.getLoadingSnapshot();
	}, "loading");

	// reset()/restore() failures (e.g. WizardRestoreError from a malformed
	// snapshot) go to the user's onError, falling back to console.error.
	const reportError = (error: unknown) => {
		const err = error instanceof Error ? error : new Error(String(error));
		if (onError) {
			onError(err);
		} else {
			console.error("[useWizard]", err);
		}
	};

	// Loading flags are reference-counted in the manager (trackLoading), so the
	// `loading` slice and `manager.getLoadingSnapshot()` always agree.
	const baseActions = createWizardActions(manager, reportError);
	// Every data-carrying action strips Vue reactivity before it reaches the
	// machine (see toRawDeep). Plain data passes through by reference, so
	// updateField's Object.is no-op and updateData's same-reference handling
	// are unchanged.
	const actions: typeof baseActions = {
		...baseActions,
		updateData: (updater) =>
			baseActions.updateData((data) => toRawDeep(updater(data))),
		setData: (data) => baseActions.setData(toRawDeep(data)),
		updateField: (field, value) =>
			baseActions.updateField(field, toRawDeep(value)),
		reset: (data) => baseActions.reset(toRawDeep(data)),
		restore: (serialized) => baseActions.restore(toRawDeep(serialized)),
	};

	// Cleanup on scope dispose (component unmount)
	onScopeDispose(() => {
		unsubscribeNavigation();
		unsubscribeLoading();
		// WIZ-007: tear down plugins (machine.destroy via the manager). Isolated
		// rejections are handled internally — fire-and-forget here.
		void manager.destroy();
	});

	// Build organized return value
	const stateSlice: UseWizardState<T> = {
		currentStepId: computed(() => state.value.currentStepId),
		currentStep: computed(() => definition.steps[state.value.currentStepId]),
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
		canGoNext: computed(() => navigation.value.canGoNext),
		canGoPrevious: computed(() => navigation.value.canGoPrevious),
		canGoBack: computed(() => navigation.value.canGoBack),
		isFirstStep: computed(() => navigation.value.isFirstStep),
		isLastStep: computed(() => navigation.value.isLastStep),
		visitedSteps: computed(() => navigation.value.visitedSteps),
		availableSteps: computed(() => navigation.value.availableSteps),
		stepHistory: computed(() => navigation.value.stepHistory),
		goNext: actions.goNext,
		goPrevious: actions.goPrevious,
		goBack: actions.goBack,
		goTo: actions.goTo,
		goToStep: actions.goToStep,
	};

	const loadingSlice: UseWizardLoading = {
		isValidating: computed(() => loading.value.isValidating),
		isSubmitting: computed(() => loading.value.isSubmitting),
		isNavigating: computed(() => loading.value.isNavigating),
	};

	const actionsSlice: UseWizardActions<T> = {
		updateData: actions.updateData,
		setData: actions.setData,
		updateField: actions.updateField,
		validate: actions.validate,
		validateAll: actions.validateAll,
		canSubmit: actions.canSubmit,
		submit: actions.submit,
		reset: actions.reset,
		cancel: actions.cancel,
		serialize: actions.serialize,
		restore: actions.restore,
	};

	return {
		state: stateSlice,
		validation: validationSlice,
		navigation: navigationSlice,
		loading: loadingSlice,
		actions: actionsSlice,
	};
}
