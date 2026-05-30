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
	useContext,
	useEffect,
	useMemo,
	useRef,
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

	// Create manager instance once
	const managerRef = useRef<WizardStateManager<T> | null>(null);

	if (!managerRef.current) {
		const events = {
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousStateRef.current;
				previousStateRef.current = newState;

				// Notify subscribers via channel-based system
				if (oldState && managerRef.current) {
					managerRef.current.handleStateChange(newState, oldState);
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

		managerRef.current = new WizardStateManager(
			machine,
			definitionRef.current.initialStepId,
		);
		previousStateRef.current = machine.snapshot;
	}

	// WIZ-007: tear down plugins on unmount. Cleanup must be synchronous; we
	// deliberately do NOT await the Promise<void> (destroy isolates its own
	// rejections internally).
	useEffect(() => {
		const manager = managerRef.current;
		return () => {
			void manager?.destroy();
		};
	}, []);

	// Create a stable context value
	const contextValue = useMemo(
		() => ({
			manager: managerRef.current as WizardStateManager<T>,
			initialData: initialDataRef.current,
		}),
		[],
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
