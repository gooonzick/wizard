import type {
	GoToOptions,
	StepId,
	StepStatus,
	ValidationSummary,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardProgress,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import {
	createMachineAndManager,
	createWizardActions,
	type WizardBindingActions,
	type WizardStateManager,
} from "@gooonzick/wizard-state";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

/**
 * React hook options
 */
export interface UseWizardOptions<T extends WizardData> {
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the hook with a new `key`.
	 */
	definition: WizardDefinition<T>;
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the hook with a new `key`.
	 */
	initialData: T;
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the hook with a new `key`.
	 */
	context?: WizardContext;
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	onError?: (error: Error) => void;
	onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
	/**
	 * Plugins registered once at machine creation (reference-stable — read once,
	 * NOT reactive). Define them outside render or memoize them.
	 *
	 * `onInit` may run for a manager that is later discarded/recreated under React
	 * StrictMode or concurrent rendering, so `onInit` must be idempotent and any
	 * resource it acquires must be released in `destroy()`.
	 */
	plugins?: WizardPlugin<T>[];
}

/**
 * State slice - current step and data
 */
export interface UseWizardState<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
	stepStatuses: Record<StepId, StepStatus>;
	progress: WizardProgress;
}

/**
 * Validation slice - validation state and errors
 */
export interface UseWizardValidation {
	isValid: boolean;
	validationErrors?: Record<string, string>;
}

/**
 * Navigation slice - step navigation capabilities
 */
export interface UseWizardNavigationState {
	canGoNext: boolean;
	canGoPrevious: boolean;
	canGoBack: boolean;
	isFirstStep: boolean;
	isLastStep: boolean;
	visitedSteps: StepId[];
	availableSteps: StepId[];
	stepHistory: StepId[];
}

/**
 * Navigation slice - step navigation methods
 */
export interface UseWizardNavigationActions {
	goNext: () => Promise<void>;
	goPrevious: () => Promise<void>;
	/**
	 * @deprecated Use `goPrevious()` instead. `goBack(1)` is equivalent;
	 * for multiple steps call `goPrevious()` repeatedly.
	 */
	goBack: (steps?: number) => Promise<void>;
	goTo: (stepId: StepId, options?: GoToOptions) => Promise<void>;
	/** @deprecated Use goTo(stepId) instead */
	goToStep: (stepId: StepId) => Promise<void>;
}

export type UseWizardNavigation = UseWizardNavigationState &
	UseWizardNavigationActions;

/**
 * Loading slice - async operation states
 */
export interface UseWizardLoading {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
	/** A lazy step implementation is loading (WIZ-013). */
	isLoadingStep: boolean;
}

/**
 * Helper types for individual wizard actions
 */
export type UpdateDataFn<T extends WizardData> = (
	updater: (data: T) => T,
) => void;
export type SetDataFn<T extends WizardData> = (data: T) => void;
export type UpdateFieldFn<T extends WizardData> = <K extends keyof T>(
	field: K,
	value: T[K],
) => void;
export type ValidateFn = () => Promise<void>;
export type ValidateAllFn = (options?: {
	updateStatuses?: boolean;
}) => Promise<ValidationSummary>;
export type CanSubmitFn = () => Promise<boolean>;
export type SubmitFn = () => Promise<void>;
export type ResetFn<T extends WizardData> = (data?: T) => void;
export type CancelFn = () => Promise<void>;
export type SerializeFn<T extends WizardData> = () => WizardSerializedState<T>;
export type RestoreFn<T extends WizardData> = (
	state: WizardSerializedState<T>,
) => void;

/**
 * Actions slice - data mutations and validation
 */
export interface UseWizardActions<T extends WizardData> {
	updateData: UpdateDataFn<T>;
	setData: SetDataFn<T>;
	updateField: UpdateFieldFn<T>;
	validate: ValidateFn;
	validateAll: ValidateAllFn;
	canSubmit: CanSubmitFn;
	submit: SubmitFn;
	/**
	 * Resets to the initial step. `reset(data)` also makes `data` the new reset
	 * baseline, so a later `reset()` (or `cancel()`) restores `data` rather than
	 * the original `initialData`.
	 */
	reset: ResetFn<T>;
	cancel: CancelFn;
	serialize: SerializeFn<T>;
	restore: RestoreFn<T>;
	/**
	 * Loads a lazy step's implementation ahead of navigation (WIZ-013).
	 * Never rejects: meant for fire-and-forget hover/focus handlers; failures
	 * are reported by the navigation that needs the step.
	 */
	preloadStep: (stepId: StepId) => Promise<void>;
}

/**
 * Complete wizard return value with organized concerns
 */
export interface UseWizardReturn<T extends WizardData> {
	state: UseWizardState<T>;
	validation: UseWizardValidation;
	navigation: UseWizardNavigation;
	loading: UseWizardLoading;
	actions: UseWizardActions<T>;
}

/**
 * Picks the navigation methods out of a shared action set. Explicit (no spread)
 * so the slice never carries the data actions. Package-internal.
 */
export function pickNavigationActions<T extends WizardData>(
	actions: WizardBindingActions<T>,
): UseWizardNavigationActions {
	return {
		goNext: actions.goNext,
		goPrevious: actions.goPrevious,
		goBack: actions.goBack,
		goTo: actions.goTo,
		goToStep: actions.goToStep,
	};
}

/**
 * Picks the data/validation/lifecycle methods out of a shared action set.
 * Explicit (no spread) so the slice never carries the navigation methods.
 * Package-internal.
 */
export function pickDataActions<T extends WizardData>(
	actions: WizardBindingActions<T>,
): UseWizardActions<T> {
	return {
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
		preloadStep: actions.preloadStep,
	};
}

/**
 * React hook for wizard state management using useSyncExternalStore
 * Returns organized state slices with fine-grained re-renders via channel subscriptions
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
		onDataChange,
		plugins,
	} = options;

	// Store callbacks in refs to avoid stale closures
	const callbacksRef = useRef({
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onCancel,
		onReset,
		onError,
		onDataChange,
	});

	// Update callbacks ref synchronously
	callbacksRef.current = {
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onCancel,
		onReset,
		onError,
		onDataChange,
	};

	// Store initial data, context, and definition in refs for stable references
	const initialDataRef = useRef(initialData);
	const contextRef = useRef(context);
	const definitionRef = useRef(definition);
	const pluginsRef = useRef(plugins);

	// Ref-guarded lazy creation. useRef persists across StrictMode's double
	// render (same fiber) and across a discarded-then-retried render, so the
	// side-effecting `new WizardMachine(...)` (plugin onInit) runs exactly once
	// per live manager. Never construct in a useState initializer (double-invoked)
	// or unconditionally in render.
	const managerRef = useRef<WizardStateManager<T> | null>(null);
	if (managerRef.current === null || managerRef.current.isDestroyed) {
		// isDestroyed is only true after the StrictMode mount->unmount->remount
		// probe tore the previous manager down; recreate re-applies the plugins.
		// `getCallbacks` reads the ref at event time, so callbacks swapped on a
		// later render are the ones invoked.
		managerRef.current = createMachineAndManager<T>({
			definition: definitionRef.current,
			context: contextRef.current,
			initialData: initialDataRef.current,
			getCallbacks: () => callbacksRef.current,
			plugins: pluginsRef.current,
		}).manager;
	}
	// `useState` holds the identity so a recreate triggers a re-render + resubscribe.
	const [, forceRerender] = useState(0);
	const manager = managerRef.current;

	// WIZ-007: tear down plugins on unmount. Cleanup must be synchronous; we
	// deliberately do NOT await the Promise<void> (destroy isolates its own
	// rejections internally).
	useEffect(() => {
		return () => {
			void manager.destroy();
			if (managerRef.current === manager) {
				// Drop the destroyed instance so the next render recreates it
				// (StrictMode remount, or a future live remount).
				managerRef.current = null;
				forceRerender((n) => n + 1);
			}
		};
	}, [manager]);

	// Subscribe to state channel using useSyncExternalStore
	const stateSnapshot = useSyncExternalStore(
		useCallback((callback) => manager.subscribe(callback, "state"), [manager]),
		useCallback(() => manager.getStateSnapshot(), [manager]),
		useCallback(() => manager.getStateSnapshot(), [manager]),
	);

	// Subscribe to navigation channel
	const navigationSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "navigation"),
			[manager],
		),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
		useCallback(() => manager.getNavigationSnapshot(), [manager]),
	);

	// Subscribe to validation channel
	const validationSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "validation"),
			[manager],
		),
		useCallback(() => manager.getValidationSnapshot(), [manager]),
		useCallback(() => manager.getValidationSnapshot(), [manager]),
	);

	// Subscribe to loading channel
	const loadingSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => manager.subscribe(callback, "loading"),
			[manager],
		),
		useCallback(() => manager.getLoadingSnapshot(), [manager]),
		useCallback(() => manager.getLoadingSnapshot(), [manager]),
	);

	// `reset`/`restore` are fire-and-forget (`void`), but the machine's synchronous
	// reset()/restore() can throw — a malformed snapshot raises WizardRestoreError,
	// which the machine does NOT route through handleError. createWizardActions
	// terminates the chain with this reporter, so a bad snapshot surfaces on
	// `onError` instead of becoming an unhandled rejection. Reads
	// `callbacksRef.current` at call time, so the empty dependency array cannot
	// go stale.
	const reportError = useCallback((error: unknown) => {
		callbacksRef.current.onError?.(
			error instanceof Error ? error : new Error(String(error)),
		);
	}, []);

	// One action set per manager: identities are stable until a StrictMode-driven
	// recreate swaps the manager. Loading flags use the manager's
	// reference-counted trackLoading(), and reset(data) passes `data` through so
	// the machine's sticky reset baseline applies.
	const actions = useMemo(
		() => createWizardActions(manager, reportError),
		[manager, reportError],
	);

	// Build organized return value
	const stateSlice: UseWizardState<T> = useMemo(
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

	const validationSlice: UseWizardValidation = useMemo(
		() => ({
			isValid: validationSnapshot.isValid,
			validationErrors: validationSnapshot.validationErrors,
		}),
		[validationSnapshot.isValid, validationSnapshot.validationErrors],
	);

	const navigationSlice: UseWizardNavigation = useMemo(
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

	const loadingSlice: UseWizardLoading = useMemo(
		() => ({
			isValidating: loadingSnapshot.isValidating,
			isSubmitting: loadingSnapshot.isSubmitting,
			isNavigating: loadingSnapshot.isNavigating,
			isLoadingStep: loadingSnapshot.isLoadingStep,
		}),
		[
			loadingSnapshot.isValidating,
			loadingSnapshot.isSubmitting,
			loadingSnapshot.isNavigating,
			loadingSnapshot.isLoadingStep,
		],
	);

	const actionsSlice: UseWizardActions<T> = useMemo(
		() => pickDataActions(actions),
		[actions],
	);

	// Return organized slices
	return useMemo(
		() => ({
			state: stateSlice,
			validation: validationSlice,
			navigation: navigationSlice,
			loading: loadingSlice,
			actions: actionsSlice,
		}),
		[stateSlice, validationSlice, navigationSlice, loadingSlice, actionsSlice],
	);
}
