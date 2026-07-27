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

/**
 * The shape actually stored in the context. `reportError` forwards an error to this
 * provider's `onError` callback and is used by the granular `useWizardActions` hook's
 * `reset`/`restore` to report a synchronous machine throw (e.g. `WizardRestoreError`,
 * raised before `WizardMachine`'s internal `handleError` routing runs) that would
 * otherwise become an unhandled promise rejection via `manager.runReset`/`runRestore`.
 *
 * Deliberately kept OFF `WizardProviderContextValue` — that is the return type of the
 * exported `useWizardProviderContext()`, so widening it would widen the package's public
 * type surface. `useWizardInternalContext` is not re-exported from `src/index.ts` and the
 * package's `exports` map has no deep-import entry, so this stays internal.
 */
interface WizardProviderInternalContextValue<T extends WizardData>
	extends WizardProviderContextValue<T> {
	reportError: (error: unknown) => void;
}

// biome-ignore lint/suspicious/noExplicitAny: skip
type AnyWizardProviderContext = WizardProviderInternalContextValue<any>;

const WizardContext = createContext<AnyWizardProviderContext | null>(null);

export interface WizardProviderProps<T extends WizardData> {
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the provider with a new `key`.
	 */
	definition: WizardDefinition<T>;
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the provider with a new `key`.
	 */
	initialData: T;
	/**
	 * Read ONCE at mount and captured — NOT reactive. Changing this prop after the
	 * first render has no effect (the machine is created once). To reconfigure,
	 * remount the provider with a new `key`.
	 */
	context?: WizardCoreContext;
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
	onDataChange,
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

	// Store initial values in refs
	const initialDataRef = useRef(initialData);
	const contextRef = useRef(context);
	const definitionRef = useRef(definition);
	const pluginsRef = useRef(plugins);

	// Track previous state for change detection
	const previousStateRef = useRef<WizardState<T> | null>(null);

	// Reads `callbacksRef.current` at call time (never a snapshot), so it cannot go
	// stale despite the empty dependency array — same contract as the `events.onError`
	// closure below.
	const reportError = useCallback((error: unknown) => {
		callbacksRef.current.onError?.(
			error instanceof Error ? error : new Error(String(error)),
		);
	}, []);

	// Holds the live manager. The events closure (created once per manager) reads
	// `managerRef.current` so it can always reach the current manager without
	// re-creating the closure.
	const managerRef = useRef<WizardStateManager<T> | null>(null);

	// Factory: build a fresh manager re-applying the same plugins/definition.
	const createManager = useCallback((): WizardStateManager<T> => {
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
			onDataChange: (prev: T, next: T, changedFields: (keyof T)[]) => {
				callbacksRef.current.onDataChange?.(prev, next, changedFields);
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

	// Ref-guarded lazy creation. useRef persists across StrictMode's double
	// render (same fiber) and across a discarded-then-retried render, so the
	// side-effecting `new WizardMachine(...)` (plugin onInit) runs exactly once
	// per live manager. Never construct in a useState initializer (double-invoked)
	// or unconditionally in render.
	if (managerRef.current === null || managerRef.current.isDestroyed) {
		// isDestroyed is only true after the StrictMode mount->unmount->remount
		// probe tore the previous manager down; recreate re-applies the plugins.
		managerRef.current = createManager();
	}
	// `useState` holds the identity so a recreate triggers a re-render + resubscribe.
	const [, forceRerender] = useState(0);
	const manager = managerRef.current;

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
			if (managerRef.current === manager) {
				// Drop the destroyed instance so the next render recreates it
				// (StrictMode remount, or a future live remount).
				managerRef.current = null;
				forceRerender((n) => n + 1);
			}
		};
	}, [manager]);

	// Create a stable context value, keyed on `manager` so consumers rebind
	// after a StrictMode-driven recreate.
	const contextValue = useMemo(
		() => ({
			manager,
			initialData: initialDataRef.current,
			reportError,
		}),
		[manager, reportError],
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
	return useWizardInternalContext<T>();
}

/**
 * Same context, widened with the provider-owned `reportError`. Package-internal: it is
 * NOT re-exported from `src/index.ts`, so the public surface stays
 * `useWizardProviderContext()`'s narrower `WizardProviderContextValue`.
 * @throws {Error} if used outside of WizardProvider
 */
export function useWizardInternalContext<
	T extends WizardData,
>(): WizardProviderInternalContextValue<T> {
	const context = useContext(WizardContext);
	if (!context) {
		throw new Error(
			"useWizardProviderContext must be used within <WizardProvider>",
		);
	}
	return context;
}
