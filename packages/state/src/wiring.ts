import type {
	StepId,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "./manager";

/**
 * The user-facing lifecycle callbacks a binding forwards to the machine.
 */
export interface WizardCallbacks<T extends WizardData> {
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onCancel?: (data: T) => void | Promise<void>;
	onReset?: () => void;
	onError?: (error: Error) => void;
	onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
}

export interface CreateMachineAndManagerOptions<T extends WizardData> {
	definition: WizardDefinition<T>;
	context: WizardContext;
	initialData: T;
	/** Read at CALL time on every event, so React can pass a ref reader. */
	getCallbacks: () => WizardCallbacks<T>;
	plugins?: WizardPlugin<T>[];
}

/**
 * Builds a WizardMachine + WizardStateManager pair with the machine's events
 * wired into the manager's channel routing and forwarded to the user callbacks.
 *
 * - Every event reads `getCallbacks()` when it fires, so swapping the callbacks
 *   object (e.g. a React ref updated each render) takes effect immediately.
 * - `onStateChange` first routes to `manager.handleMachineStateChange()`, then
 *   calls the user callback. Emissions fired synchronously from the machine
 *   constructor (before the manager exists) are not routed; the manager seeds
 *   its baseline from `machine.snapshot` itself.
 * - Errors the manager catches (navigation recompute failures) go to
 *   `getCallbacks().onError`, or `console.error` when none is registered.
 */
export function createMachineAndManager<T extends WizardData>(
	options: CreateMachineAndManagerOptions<T>,
): { machine: WizardMachine<T>; manager: WizardStateManager<T> } {
	const { definition, context, initialData, getCallbacks, plugins } = options;

	// Forward reference: null during constructor-time emissions.
	let manager: WizardStateManager<T> | null = null;

	const machine = new WizardMachine<T>(
		definition,
		context,
		initialData,
		{
			onStateChange: (newState: WizardState<T>) => {
				manager?.handleMachineStateChange(newState);
				getCallbacks().onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, data: T) => {
				getCallbacks().onStepEnter?.(stepId, data);
			},
			onStepLeave: (stepId: StepId, data: T) => {
				getCallbacks().onStepLeave?.(stepId, data);
			},
			onComplete: (data: T) => {
				getCallbacks().onComplete?.(data);
			},
			onCancel: async (data: T) => {
				await getCallbacks().onCancel?.(data);
			},
			onReset: () => {
				getCallbacks().onReset?.();
			},
			onError: (error: Error) => {
				getCallbacks().onError?.(error);
			},
			onDataChange: (prev: T, next: T, changedFields: (keyof T)[]) => {
				getCallbacks().onDataChange?.(prev, next, changedFields);
			},
		},
		plugins,
	);

	const created = new WizardStateManager<T>(machine, definition.initialStepId, {
		onError: (error: Error) => {
			const onError = getCallbacks().onError;
			if (onError) {
				onError(error);
			} else {
				console.error(error);
			}
		},
	});
	manager = created;

	return { machine, manager: created };
}
