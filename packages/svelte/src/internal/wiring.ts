import type {
	StepId,
	WizardContext,
	WizardData,
	WizardDefinition,
	WizardPlugin,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";

/**
 * The user-facing lifecycle callbacks forwarded to the machine's events object.
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

/**
 * Builds the machine + manager pair and wires `onStateChange` into the manager's
 * channel routing, mirroring `packages/react/src/use-wizard.tsx`.
 */
export function createMachineAndManager<T extends WizardData>(
	definition: WizardDefinition<T>,
	context: WizardContext,
	initialData: T,
	callbacks: WizardCallbacks<T>,
	plugins?: WizardPlugin<T>[],
): { machine: WizardMachine<T>; manager: WizardStateManager<T> } {
	// Forward references. The machine fires onStateChange synchronously from its
	// constructor (initializeFirstStep) BEFORE these are assigned — hence the guard.
	let manager: WizardStateManager<T> | null = null;
	let previousState: WizardState<T> | null = null;

	const machine = new WizardMachine<T>(
		definition,
		context,
		initialData,
		{
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousState;
				previousState = newState;
				// Route the change to the manager's channels. Skipped for the early
				// constructor-time emissions (no manager, no oldState yet) — the
				// initial snapshot is read directly by the manager's own constructor.
				if (oldState && manager) {
					manager.handleStateChange(newState, oldState);
				}
				callbacks.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, data: T) =>
				callbacks.onStepEnter?.(stepId, data),
			onStepLeave: (stepId: StepId, data: T) =>
				callbacks.onStepLeave?.(stepId, data),
			onComplete: (data: T) => callbacks.onComplete?.(data),
			onCancel: async (data: T) => {
				await callbacks.onCancel?.(data);
			},
			onReset: () => callbacks.onReset?.(),
			onError: (error: Error) => callbacks.onError?.(error),
			onDataChange: (prev: T, next: T, changedFields: (keyof T)[]) =>
				callbacks.onDataChange?.(prev, next, changedFields),
		},
		plugins,
	);

	manager = new WizardStateManager(machine, definition.initialStepId);
	// Pre-seed so the very next onStateChange has an oldState (React does the same
	// at packages/react/src/use-wizard.tsx:296).
	previousState = machine.snapshot;

	return { machine, manager };
}
