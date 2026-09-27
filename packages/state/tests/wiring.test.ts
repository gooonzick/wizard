import {
	createLinearWizard,
	type WizardPlugin,
	type WizardState,
} from "@gooonzick/wizard-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMachineAndManager, type WizardCallbacks } from "../src/wiring";

type Data = { name: string };

const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function buildDefinition() {
	return createLinearWizard<Data>({
		id: "wiring",
		steps: [{ id: "step1" }, { id: "step2" }],
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createMachineAndManager", () => {
	it("reads callbacks at call time, so swapping them takes effect", () => {
		const first = vi.fn();
		const second = vi.fn();
		let callbacks: WizardCallbacks<Data> = { onDataChange: first };

		const { machine } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => callbacks,
		});

		machine.updateField("name", "a");
		expect(first).toHaveBeenCalledTimes(1);
		expect(first).toHaveBeenCalledWith({ name: "" }, { name: "a" }, ["name"]);

		callbacks = { onDataChange: second };
		machine.updateField("name", "b");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledWith({ name: "a" }, { name: "b" }, ["name"]);
	});

	it("tolerates onStateChange emissions fired while the machine is constructed", () => {
		const onStateChange = vi.fn();
		// A plugin that restores a snapshot from onInit makes the machine emit
		// onStateChange synchronously, before the manager exists.
		const plugin: WizardPlugin<Data> = {
			name: "ctor-emitter",
			onInit: (m) => {
				const serialized = m.serialize?.();
				if (serialized) {
					m.restore?.({ ...serialized, data: { name: "from-init" } });
				}
			},
		};

		const { machine, manager } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({ onStateChange }),
			plugins: [plugin],
		});

		// The user callback still saw the constructor-time emission.
		expect(onStateChange).toHaveBeenCalled();
		// The manager seeded its caches from the post-emission machine state.
		expect(manager.getSnapshot()).toEqual(machine.snapshot);
		expect(manager.getStateSnapshot().data).toEqual({ name: "from-init" });
	});

	it("routes machine changes through the manager channels, then the user callback", async () => {
		const order: string[] = [];
		const { machine, manager } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({
				onStateChange: (state: WizardState<Data>) => {
					order.push(`callback:${state.data.name}`);
					// Manager caches are already refreshed when the callback runs.
					expect(manager.getStateSnapshot().data.name).toBe(state.data.name);
				},
			}),
		});
		await settle();
		order.length = 0;

		const stateListener = vi.fn(() => order.push("state-listener"));
		const navListener = vi.fn();
		manager.subscribe(stateListener, "state");
		manager.subscribe(navListener, "navigation");

		machine.updateField("name", "x");
		expect(order).toEqual(["state-listener", "callback:x"]);
		expect(manager.getStateSnapshot().data.name).toBe("x");

		await machine.goNext();
		await settle();
		expect(manager.getStateSnapshot().currentStepId).toBe("step2");
		expect(navListener).toHaveBeenCalled();
		expect(manager.getNavigationSnapshot().canGoBack).toBe(true);
		expect(manager.getNavigationSnapshot().stepHistory).toEqual([
			"step1",
			"step2",
		]);
	});

	it("forwards step/lifecycle events and awaits onCancel", async () => {
		const events: string[] = [];
		let releaseCancel!: () => void;
		const cancelGate = new Promise<void>((r) => {
			releaseCancel = r;
		});
		const { machine, manager } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({
				onStepEnter: (id) => events.push(`enter:${id}`),
				onStepLeave: (id) => events.push(`leave:${id}`),
				onReset: () => events.push("reset"),
				onCancel: async () => {
					events.push("cancel:start");
					await cancelGate;
					events.push("cancel:end");
				},
			}),
		});
		await settle();
		await machine.goNext();
		expect(events).toContain("leave:step1");
		expect(events).toContain("enter:step2");

		let cancelled = false;
		const cancelling = manager.runCancel().then(() => {
			cancelled = true;
		});
		await settle();
		expect(events).toContain("cancel:start");
		expect(cancelled).toBe(false);

		releaseCancel();
		await cancelling;
		expect(events).toContain("cancel:end");
		expect(events).toContain("reset");
	});

	it("routes manager navigation errors to getCallbacks().onError at call time", async () => {
		const early = vi.fn();
		const late = vi.fn();
		let callbacks: WizardCallbacks<Data> = { onError: early };
		const { machine } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => callbacks,
		});
		await settle();

		callbacks = { onError: late };
		const boom = new Error("boom");
		vi.spyOn(machine, "getAvailableSteps").mockRejectedValue(boom);
		machine.updateField("name", "trigger");
		await settle();

		expect(early).not.toHaveBeenCalled();
		expect(late).toHaveBeenCalledWith(boom);
	});

	it("logs manager navigation errors with console.error when no onError is set", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { machine } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({}),
		});
		await settle();

		const boom = new Error("boom");
		vi.spyOn(machine, "getAvailableSteps").mockRejectedValue(boom);
		machine.updateField("name", "trigger");
		await settle();

		expect(consoleSpy).toHaveBeenCalledWith(boom);
	});
});
