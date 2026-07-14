import {
	createLinearWizard,
	type WizardData,
	type WizardDefinition,
	WizardMachine,
	type WizardState,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

interface D extends WizardData {
	name: string;
}

// See manager.test.ts for the rationale — replicates the binding wiring.
function createWiredManager<T extends WizardData>(
	definition: WizardDefinition<T>,
	initialData: T,
) {
	let manager: WizardStateManager<T>;
	let previous: WizardState<T> | undefined;
	const machine = new WizardMachine<T>(definition, {}, initialData, {
		onStateChange: (newState) => {
			const old = previous;
			previous = newState;
			if (old) manager.handleStateChange(newState, old);
		},
	});
	previous = machine.snapshot;
	manager = new WizardStateManager<T>(machine, definition.initialStepId);
	return { machine, manager };
}

const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const def: WizardDefinition<D> = createLinearWizard<D>({
	id: "destroy",
	steps: [{ id: "step1" }, { id: "step2" }],
});

describe("WizardStateManager.destroy guard", () => {
	it("does not notify subscribers after destroy()", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();
		const listener = vi.fn();
		mgr.subscribe(listener);

		await mgr.destroy();
		listener.mockClear();

		// Direct notify attempts must be inert.
		mgr.notifySubscribers(["state"]);
		mgr.setLoadingState({ isValidating: true });
		expect(listener).not.toHaveBeenCalled();
		expect(mgr.isDestroyed).toBe(true);
	});

	it("ignores an in-flight navigation recompute that resolves after destroy()", async () => {
		const { machine, manager: mgr } = createWiredManager<D>(def, { name: "a" });
		const listener = vi.fn();
		mgr.subscribe(listener, "navigation");
		// Trigger a recompute then destroy before it settles.
		machine.updateData((d) => ({ ...d, name: "b" }));
		await mgr.destroy();
		listener.mockClear();
		await settle();
		expect(listener).not.toHaveBeenCalled();
	});
});
