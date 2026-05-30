import type {
	StepId,
	WizardContext as WizardCoreContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

/**
 * Context for granular hooks - holds the WizardStateManager for fine-grained subscriptions
 */
interface WizardProviderContextValue<T extends WizardData> {
	manager: WizardStateManager<T>;
	initialData: T;
}

// biome-ignore lint/suspicious/noExplicitAny: skip
const WizardContext = createContext<WizardProviderContextValue<any> | null>(
	null,
);

export interface WizardProviderProps<T extends WizardData> {
	definition: WizardDefinition<T>;
	initialData: T;
	context?: WizardCoreContext;
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
	children: ReactNode;
}

/**
 * Provider for fine-grained subscriptions via granular hooks
 * Exposes a shared WizardStateManager instance for channel-based subscriptions
 */
export function WizardProvider<T extends WizardData>({
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
	children,
}: WizardProviderProps<T>) {
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

	// Store initial values in refs
	const initialDataRef = useRef(initialData);
	const contextRef = useRef(context);
	const definitionRef = useRef(definition);
	const pluginsRef = useRef(plugins);

	// Track previous state for change detection
	const previousStateRef = useRef<WizardState<T> | null>(null);

	// Holds the live manager. `managerStateRef` mirrors the state value so the
	// events closure (created once per manager) can always reach the current
	// manager without re-creating the closure.
	const managerStateRef = useRef<WizardStateManager<T> | null>(null);

	// Factory: build a fresh manager re-applying the same plugins/definition.
	const createManager = useCallback((): WizardStateManager<T> => {
		const events = {
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousStateRef.current;
				previousStateRef.current = newState;

				// Notify subscribers via channel-based system
				if (oldState && managerStateRef.current) {
					managerStateRef.current.handleStateChange(newState, oldState);
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
		};

		const machine = new WizardMachine(
			definitionRef.current,
			contextRef.current,
			initialDataRef.current,
			events,
			pluginsRef.current,
		);

		const newManager = new WizardStateManager(
			machine,
			definitionRef.current.initialStepId,
		);
		previousStateRef.current = machine.snapshot;
		return newManager;
	}, []);

	// Manager state (created once; native machine.reset() handles resets).
	const [managerState, setManagerState] = useState<WizardStateManager<T>>(
		() => {
			const m = createManager();
			managerStateRef.current = m;
			return m;
		},
	);

	// WIZ-007: if the StrictMode mount->unmount->remount probe destroyed the
	// manager, recreate it (re-applying the same plugins). Production never trips
	// this: with no probe, isDestroyed stays false on a live manager.
	const manager = managerState.isDestroyed ? createManager() : managerState;
	if (manager !== managerState) {
		managerStateRef.current = manager;
		setManagerState(manager); // re-render with the live manager; subscriptions rebind
	}

	// Re-render the provider when the manager emits, so a navigation issued by a
	// consumer (which destroys/leaves M1 a zombie under StrictMode) drives the
	// render-phase recreate above. In production this is a normal subscription.
	useSyncExternalStore(
		useCallback((cb) => manager.subscribe(cb, "all"), [manager]),
		useCallback(() => manager.isDestroyed, [manager]),
		useCallback(() => manager.isDestroyed, [manager]),
	);

	// WIZ-007: tear down plugins on unmount. Cleanup must be synchronous; we
	// deliberately do NOT await the Promise<void> (destroy isolates its own
	// rejections internally). Keyed on `manager` so it re-registers after a
	// StrictMode-driven recreate.
	useEffect(() => {
		return () => {
			void manager.destroy();
		};
	}, [manager]);

	// Create a stable context value, keyed on `manager` so consumers rebind
	// after a StrictMode-driven recreate.
	const contextValue = useMemo(
		() => ({
			manager,
			initialData: initialDataRef.current,
		}),
		[manager],
	);

	return (
		<WizardContext.Provider value={contextValue}>
			{children}
		</WizardContext.Provider>
	);
}

/**
 * Get wizard provider context (internal use for granular hooks)
 * @throws {Error} if used outside of WizardProvider
 */
export function useWizardProviderContext<
	T extends WizardData,
>(): WizardProviderContextValue<T> {
	const context = useContext(WizardContext);
	if (!context) {
		throw new Error(
			"useWizardProviderContext must be used within <WizardProvider>",
		);
	}
	return context;
}
