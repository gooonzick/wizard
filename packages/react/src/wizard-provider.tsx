import type {
	StepId,
	WizardContext as WizardCoreContext,
	WizardData,
	WizardDefinition,
	WizardState,
} from "@wizard/core";
import { WizardMachine } from "@wizard/core";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
} from "react";
import { WizardStateManager } from "./internal/wizard-state-manager";

/**
 * Context for granular hooks - holds the WizardStateManager for fine-grained subscriptions
 */
interface WizardProviderContextValue<T extends WizardData> {
	manager: WizardStateManager<T>;
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
	onError?: (error: Error) => void;
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
	onError,
	children,
}: WizardProviderProps<T>) {
	// Store callbacks in refs to avoid stale closures
	const callbacksRef = useRef({
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onError,
	});

	// Update callbacks ref synchronously
	callbacksRef.current = {
		onStateChange,
		onStepEnter,
		onStepLeave,
		onComplete,
		onError,
	};

	// Store initial values in refs
	const initialDataRef = useRef(initialData);
	const contextRef = useRef(context);
	const definitionRef = useRef(definition);

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
			onError: (error: Error) => {
				callbacksRef.current.onError?.(error);
			},
		};

		const machine = new WizardMachine(
			definitionRef.current,
			contextRef.current,
			initialDataRef.current,
			events,
		);

		managerRef.current = new WizardStateManager(
			machine,
			definitionRef.current.initialStepId,
		);
		previousStateRef.current = machine.snapshot;
	}

	// Create a stable context value
	const contextValue = useMemo(
		() => ({
			manager: managerRef.current as WizardStateManager<T>,
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
