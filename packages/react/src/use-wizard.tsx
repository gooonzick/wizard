import type {
	GoToOptions,
	StepId,
	StepStatus,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardProgress,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
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
	definition: WizardDefinition<T>;
	initialData: T;
	context?: WizardContext;
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	onError?: (error: Error) => void;
	/**
	 * Plugins registered once at machine creation (reference-stable — read once,
	 * NOT reactive). Define them outside render or memoize them.
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
	canSubmit: CanSubmitFn;
	submit: SubmitFn;
	reset: ResetFn<T>;
	cancel: CancelFn;
	serialize: SerializeFn<T>;
	restore: RestoreFn<T>;
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
	};

	// Store initial data, context, and definition in refs for stable references
	const initialDataRef = useRef(initialData);
	const contextRef = useRef(context);
	const definitionRef = useRef(definition);
	const pluginsRef = useRef(plugins);

	// Track previous state for change detection
	const previousStateRef = useRef<WizardState<T> | null>(null);

	// Helper function to create events object
	const createEvents = useCallback(
		(getManager: () => WizardStateManager<T> | null) => ({
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousStateRef.current;
				previousStateRef.current = newState;

				// Notify subscribers via channel-based system
				const mgr = getManager();
				if (oldState && mgr) {
					mgr.handleStateChange(newState, oldState);
				}

				callbacksRef.current.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, data: T) => {
				callbacksRef.current.onStepEnter?.(stepId, data);
			},
			onStepLeave: (stepId: StepId, data: T) => {
				callbacksRef.current.onStepLeave?.(stepId, data);
			},
			onComplete: (data: T) => {
				callbacksRef.current.onComplete?.(data);
			},
			onCancel: async (data: T) => {
				await callbacksRef.current.onCancel?.(data);
			},
			onReset: () => {
				callbacksRef.current.onReset?.();
			},
			onError: (error: Error) => {
				callbacksRef.current.onError?.(error);
			},
		}),
		[],
	);

	// Helper function to create a new manager
	const createManager = useCallback(
		(data: T): WizardStateManager<T> => {
			// We need to pass a getter that returns the manager we're about to create
			// This is a bit circular, but the events won't be called until after the manager exists
			let newManager: WizardStateManager<T> | null = null;
			const events = createEvents(() => newManager);

			const machine = new WizardMachine(
				definitionRef.current,
				contextRef.current,
				data,
				events,
				pluginsRef.current,
			);

			newManager = new WizardStateManager(
				machine,
				definitionRef.current.initialStepId,
			);
			previousStateRef.current = machine.snapshot;
			return newManager;
		},
		[createEvents],
	);

	// Use state for manager (created once; native machine.reset() handles resets)
	const [managerState, setManagerState] = useState<WizardStateManager<T>>(() =>
		createManager(initialDataRef.current),
	);
	// WIZ-007: if the StrictMode mount->unmount->remount probe destroyed the
	// manager, recreate it on remount (re-applying the same plugins). Production
	// never trips this: with no probe, isDestroyed is always false on remount.
	const manager = managerState.isDestroyed
		? createManager(initialDataRef.current)
		: managerState;
	if (manager !== managerState) {
		setManagerState(manager); // re-render with the live manager; subscriptions rebind
	}

	// WIZ-007: tear down plugins on unmount. Cleanup must be synchronous; we
	// deliberately do NOT await the Promise<void> (destroy isolates its own
	// rejections internally).
	useEffect(() => {
		return () => {
			void manager.destroy();
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

	// Data mutations
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

	// Validation
	const validate = useCallback(async () => {
		manager.setLoadingState({ isValidating: true });
		try {
			await manager.getMachine().validate();
		} finally {
			manager.setLoadingState({ isValidating: false });
		}
	}, [manager]);

	const canSubmitFn = useCallback(async (): Promise<boolean> => {
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

	// Navigation
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

	const reset = useCallback(
		(data?: T) => {
			void manager.runReset(data ?? initialDataRef.current);
		},
		[manager],
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

	const loadingSlice: UseWizardLoading = useMemo(
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

	const actionsSlice: UseWizardActions<T> = useMemo(
		() => ({
			updateData,
			setData,
			updateField,
			validate,
			canSubmit: canSubmitFn,
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
			canSubmitFn,
			submit,
			reset,
			cancel,
			serialize,
			restore,
		],
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
