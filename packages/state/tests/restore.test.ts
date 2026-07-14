import {
	createLinearWizard,
	type WizardData,
	type WizardDefinition,
	WizardMachine,
	type WizardSerializedState,
	type WizardState,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

interface D extends WizardData {
	name: string;
}

// See manager.test.ts for the rationale — replicates the binding wiring so the
// manager's caches update through the real machine's onStateChange.
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
	id: "restore",
	steps: [{ id: "step1" }, { id: "step2" }],
});

// A source machine navigated to step2, serialized.
async function serializedOnStep2(): Promise<WizardSerializedState<D>> {
	const source = new WizardMachine<D>(def, {}, { name: "a" }, {});
	await source.goNext();
	return source.serialize();
}

describe("WizardStateManager.runRestore", () => {
	// T1 — successful restore updates snapshot + caches.
	it("restores machine state and updates manager caches", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();
		expect(mgr.getStateSnapshot().currentStepId).toBe("step1");

		const serialized = await serializedOnStep2();

		await mgr.runRestore(serialized);
		await settle(); // allow the fire-and-forget re-validate to settle

		expect(mgr.getSnapshot().currentStepId).toBe("step2");
		expect(mgr.getStateSnapshot().currentStepId).toBe("step2");
		expect(mgr.getLoadingSnapshot()).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		});
	});

	// T2 — corrupt payload (version mismatch) rejects, state unchanged.
	it("rejects a corrupt payload and leaves state on the original step", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();

		const bad = {
			version: 999,
			currentStepId: "step1",
			data: { name: "x" },
			history: ["step1"],
			visitedSteps: ["step1"],
			isValid: true,
			isCompleted: false,
			stepStatuses: {},
		} as unknown as Parameters<typeof mgr.runRestore>[0];

		await expect(mgr.runRestore(bad)).rejects.toThrow();
		expect(mgr.getStateSnapshot().currentStepId).toBe("step1"); // unchanged
		// finally-block cleared loading flags despite the throw:
		expect(mgr.getLoadingSnapshot().isNavigating).toBe(false);
	});

	// T2 variant — unknown-step payload rejects with a specific message.
	it("rejects an unknown-step payload", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();

		const serialized = await serializedOnStep2();
		const bad = {
			...serialized,
			currentStepId: "does-not-exist",
		} as unknown as Parameters<typeof mgr.runRestore>[0];

		await expect(mgr.runRestore(bad)).rejects.toThrow(/does not exist/);
		expect(mgr.getStateSnapshot().currentStepId).toBe("step1"); // unchanged
	});

	// T3 — rejection propagates as an Error; loading channel saw set+clear.
	it("surfaces the rejection as an Error and clears loading via finally", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();

		const loadingListener = vi.fn();
		mgr.subscribe(loadingListener, "loading");

		const bad = {
			version: 999,
			currentStepId: "step1",
			data: { name: "x" },
			history: ["step1"],
			visitedSteps: ["step1"],
			isValid: true,
			isCompleted: false,
			stepStatuses: {},
		} as unknown as Parameters<typeof mgr.runRestore>[0];

		await expect(mgr.runRestore(bad)).rejects.toBeInstanceOf(Error);
		// setLoadingState fired at the start AND in the finally block.
		expect(loadingListener.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(mgr.getLoadingSnapshot()).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		});
	});

	// T4 — post-restore navigation-state recompute.
	it("recomputes navigation after a successful restore", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();

		const serialized = await serializedOnStep2();
		await mgr.runRestore(serialized);
		await settle();

		const nav = mgr.getNavigationSnapshot();
		expect(nav.isFirstStep).toBe(false); // restored onto step2
		expect(nav.canGoPrevious).toBe(true); // has a previous
		expect(nav.availableSteps).toEqual(["step1", "step2"]);
		expect(nav.stepHistory).toEqual(["step1", "step2"]);
	});

	// T5 — restore-then-destroy is safe (no post-destroy notify). Depends on the
	// Section E destroy guard.
	it("does not notify after destroy following a restore", async () => {
		const { manager: mgr } = createWiredManager<D>(def, { name: "a" });
		await settle();
		const serialized = await serializedOnStep2();

		const listener = vi.fn();
		mgr.subscribe(listener);
		await mgr.runRestore(serialized);
		listener.mockClear(); // ignore the restore-time notifications

		await mgr.destroy();
		await settle(); // let the async re-validate resolve post-destroy

		expect(listener).not.toHaveBeenCalled();
	});
});
