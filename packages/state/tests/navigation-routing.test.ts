import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";
import { createMachineAndManager } from "../src/wiring";

type Data = { name: string };

const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function buildDefinition() {
	return createLinearWizard<Data>({
		id: "nav-routing",
		steps: [{ id: "step1" }, { id: "step2" }, { id: "step3" }],
	});
}

function deferred<R = void>() {
	let resolve!: (value: R) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<R>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("history-only changes refresh the navigation channel", () => {
	it("clearHistory() notifies navigation subscribers and updates the cache", async () => {
		const { machine, manager } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({}),
		});

		await machine.goNext();
		await settle();
		expect(manager.getNavigationSnapshot().canGoBack).toBe(true);
		expect(manager.getNavigationSnapshot().stepHistory).toEqual([
			"step1",
			"step2",
		]);

		const navListener = vi.fn();
		manager.subscribe(navListener, "navigation");

		machine.clearHistory();

		expect(navListener).toHaveBeenCalled();
		const nav = manager.getNavigationSnapshot();
		expect(nav.canGoBack).toBe(false);
		expect(nav.stepHistory).toEqual(["step2"]);
	});

	it("routes navigation when only the machine history differs from the cache", async () => {
		const definition = buildDefinition();
		// Unwired machine: its changes never reach the manager on their own.
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const manager = new WizardStateManager<Data>(
			machine,
			definition.initialStepId,
		);
		const lastSeen = manager.getSnapshot();
		await machine.goNext();
		// Bring the state slice (cached currentStep) up to the machine without
		// touching the navigation cache.
		manager.notifySubscribers(["state"]);

		const navListener = vi.fn();
		const stateListener = vi.fn();
		manager.subscribe(navListener, "navigation");
		manager.subscribe(stateListener, "state");

		// Same data / step / statuses / canGoBack as the manager's last state:
		// only the machine's history and visited arrays moved.
		manager.handleMachineStateChange({ ...lastSeen });

		expect(navListener).toHaveBeenCalledTimes(1);
		expect(stateListener).not.toHaveBeenCalled();
		expect(manager.getNavigationSnapshot().stepHistory).toEqual([
			"step1",
			"step2",
		]);
		expect(manager.getNavigationSnapshot().visitedSteps).toEqual([
			"step1",
			"step2",
		]);
	});

	it("does not route navigation when nothing navigation-related changed", async () => {
		const { manager } = createMachineAndManager<Data>({
			definition: buildDefinition(),
			context: {},
			initialData: { name: "" },
			getCallbacks: () => ({}),
		});
		await settle();

		const navListener = vi.fn();
		manager.subscribe(navListener, "navigation");
		manager.handleMachineStateChange({ ...manager.getSnapshot() });

		expect(navListener).not.toHaveBeenCalled();
	});
});

describe("handleMachineStateChange", () => {
	it("diffs against the last state, including states passed to handleStateChange", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const manager = new WizardStateManager<Data>(
			machine,
			definition.initialStepId,
		);
		const stateListener = vi.fn();
		manager.subscribe(stateListener, "state");

		machine.updateField("name", "a");
		const first = machine.snapshot;
		manager.handleMachineStateChange(first);
		expect(stateListener).toHaveBeenCalledTimes(1);
		expect(manager.getStateSnapshot().data.name).toBe("a");

		// Same state again: no change relative to lastState.
		manager.handleMachineStateChange(first);
		expect(stateListener).toHaveBeenCalledTimes(1);

		// A legacy direct handleStateChange call also advances lastState.
		machine.updateField("name", "b");
		const second = machine.snapshot;
		manager.handleStateChange(second, first);
		expect(stateListener).toHaveBeenCalledTimes(2);
		manager.handleMachineStateChange(second);
		expect(stateListener).toHaveBeenCalledTimes(2);
	});
});

describe("navigation recompute errors are reported, not swallowed", () => {
	it("routes a failed recompute to options.onError as an Error", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const boom = new Error("boom");
		vi.spyOn(machine, "getAvailableSteps").mockRejectedValue(boom);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn();

		new WizardStateManager<Data>(machine, definition.initialStepId, {
			onError,
		});
		await settle();

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(boom);
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it("normalizes non-Error rejections to Error", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		vi.spyOn(machine, "getNextStepId").mockRejectedValue("bad guard");
		const onError = vi.fn();

		new WizardStateManager<Data>(machine, definition.initialStepId, {
			onError,
		});
		await settle();

		expect(onError).toHaveBeenCalledTimes(1);
		const reported = onError.mock.calls[0][0];
		expect(reported).toBeInstanceOf(Error);
		expect(reported.message).toBe("bad guard");
	});

	it("falls back to console.error without an onError option", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const boom = new Error("boom");
		vi.spyOn(machine, "getAvailableSteps").mockRejectedValue(boom);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		new WizardStateManager<Data>(machine, definition.initialStepId);
		await settle();

		expect(consoleSpy).toHaveBeenCalledWith(
			"[WizardStateManager] navigation computation failed:",
			boom,
		);
	});

	it("logs instead of rejecting when options.onError itself throws", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const boom = new Error("boom");
		vi.spyOn(machine, "getAvailableSteps").mockRejectedValue(boom);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		new WizardStateManager<Data>(machine, definition.initialStepId, {
			onError: () => {
				throw new Error("handler broke");
			},
		});
		await settle();

		expect(consoleSpy).toHaveBeenCalledWith(
			"[WizardStateManager] navigation computation failed:",
			boom,
		);
	});

	it("does not report a failure that settles after destroy()", async () => {
		const definition = buildDefinition();
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const pending = deferred<string[]>();
		vi.spyOn(machine, "getAvailableSteps").mockReturnValue(pending.promise);
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn();

		const manager = new WizardStateManager<Data>(
			machine,
			definition.initialStepId,
			{ onError },
		);
		await manager.destroy();
		pending.reject(new Error("late"));
		await settle();

		expect(onError).not.toHaveBeenCalled();
		expect(consoleSpy).not.toHaveBeenCalled();
	});
});
