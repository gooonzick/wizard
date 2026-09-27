import {
	createLinearWizard,
	WizardNavigationError,
	WizardRestoreError,
	type WizardSerializedState,
} from "@gooonzick/wizard-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWizardActions } from "../src/actions";
import { createMachineAndManager } from "../src/wiring";

type Data = { name: string };

const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function deferred<R = void>() {
	let resolve!: (value: R) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<R>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

type StepConfig = Parameters<typeof createLinearWizard<Data>>[0]["steps"];

function setup(steps?: StepConfig) {
	const definition = createLinearWizard<Data>({
		id: "actions",
		steps: steps ?? [{ id: "step1" }, { id: "step2" }, { id: "step3" }],
	});
	const { machine, manager } = createMachineAndManager<Data>({
		definition,
		context: {},
		initialData: { name: "initial" },
		getCallbacks: () => ({}),
	});
	const reportError = vi.fn();
	const actions = createWizardActions(manager, reportError);
	return { machine, manager, actions, reportError };
}

// Collect unhandled rejections raised while a test runs (tests run in Node;
// the package does not depend on @types/node, hence the narrow local type).
type ProcessLike = {
	on(event: "unhandledRejection", fn: (reason: unknown) => void): void;
	off(event: "unhandledRejection", fn: (reason: unknown) => void): void;
};
const nodeProcess = (globalThis as unknown as { process: ProcessLike }).process;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
	unhandled.push(reason);
};
beforeEach(() => {
	unhandled.length = 0;
	nodeProcess.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
	nodeProcess.off("unhandledRejection", onUnhandled);
	vi.restoreAllMocks();
});

describe("createWizardActions", () => {
	it("keeps isNavigating true until the first goNext settles when a double click is rejected as busy", async () => {
		const gate = deferred();
		const { manager, actions } = setup([
			{ id: "step1", onSubmit: () => gate.promise },
			{ id: "step2" },
		]);
		await settle();

		const first = actions.goNext();
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		const second = actions.goNext();
		await expect(second).rejects.toBeInstanceOf(WizardNavigationError);
		// The busy rejection must not clear the in-flight navigation's flag.
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		gate.resolve();
		await first;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
		expect(manager.getStateSnapshot().currentStepId).toBe("step2");
	});

	it("goPrevious / goBack / goTo / goToStep navigate and track isNavigating", async () => {
		const { manager, actions } = setup([
			{
				id: "step1",
				validate: async () => ({ valid: false, errors: { name: "req" } }),
			},
			{ id: "step2" },
			{ id: "step3" },
		]);
		await settle();

		// goToStep skips validation, so the invalid step1 does not block it.
		const toStep = actions.goToStep("step3");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);
		await toStep;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
		expect(manager.getStateSnapshot().currentStepId).toBe("step3");

		await actions.goTo("step2");
		expect(manager.getStateSnapshot().currentStepId).toBe("step2");

		await actions.goBack();
		expect(manager.getStateSnapshot().currentStepId).toBe("step3");

		await actions.goPrevious();
		expect(manager.getStateSnapshot().currentStepId).not.toBe("step3");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("reset() with no args after reset(X) resets to X", async () => {
		const { machine, actions } = setup();

		actions.reset({ name: "X" });
		await settle();
		expect(machine.snapshot.data).toEqual({ name: "X" });

		actions.updateField("name", "Y");
		expect(machine.snapshot.data).toEqual({ name: "Y" });

		actions.reset();
		await settle();
		expect(machine.snapshot.data).toEqual({ name: "X" });
	});

	it("passes reset data through unchanged (undefined reaches machine.reset)", async () => {
		const { machine, actions } = setup();
		const resetSpy = vi.spyOn(machine, "reset");

		actions.reset();
		await settle();

		expect(resetSpy).toHaveBeenCalledTimes(1);
		expect(resetSpy.mock.calls[0][0]).toBeUndefined();
	});

	it("routes reset failures to reportError instead of an unhandled rejection", async () => {
		const { machine, actions, reportError } = setup();
		const boom = new Error("reset failed");
		vi.spyOn(machine, "reset").mockImplementation(() => {
			throw boom;
		});

		actions.reset();
		await settle();

		expect(reportError).toHaveBeenCalledWith(boom);
		expect(unhandled).toEqual([]);
	});

	it("routes restore failures to reportError instead of an unhandled rejection", async () => {
		const { actions, reportError } = setup();

		actions.restore({
			version: 1,
			currentStepId: "does-not-exist",
		} as unknown as WizardSerializedState<Data>);
		await settle();

		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
		expect(unhandled).toEqual([]);
	});

	it("restore() applies a serialized state", async () => {
		const { machine, actions, reportError } = setup();
		await actions.goNext();
		actions.updateField("name", "saved");
		const saved = actions.serialize();

		actions.reset();
		await settle();
		expect(machine.snapshot.currentStepId).toBe("step1");

		actions.restore(saved);
		await settle();
		expect(machine.snapshot.currentStepId).toBe("step2");
		expect(machine.snapshot.data).toEqual({ name: "saved" });
		expect(reportError).not.toHaveBeenCalled();
	});

	it("validate() and validateAll() hold isValidating while in flight", async () => {
		let gate = deferred();
		const { manager, actions } = setup([
			{
				id: "step1",
				validate: async () => {
					await gate.promise;
					return { valid: true };
				},
			},
			{ id: "step2" },
		]);
		await settle();

		const validating = actions.validate();
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);
		gate.resolve();
		await validating;
		expect(manager.getLoadingSnapshot().isValidating).toBe(false);

		gate = deferred();
		const all = actions.validateAll();
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);
		gate.resolve();
		const summary = await all;
		expect(summary.valid).toBe(true);
		expect(manager.getLoadingSnapshot().isValidating).toBe(false);
	});

	it("submit() holds isSubmitting while in flight", async () => {
		const gate = deferred();
		const { manager, actions } = setup([
			{ id: "step1", onSubmit: () => gate.promise },
		]);
		await settle();

		const submitting = actions.submit();
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(true);
		gate.resolve();
		await submitting;
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(false);
	});

	it("data mutators and canSubmit call the machine directly", async () => {
		const { machine, manager, actions } = setup();
		const stateListener = vi.fn();
		manager.subscribe(stateListener, "state");

		actions.setData({ name: "a" });
		expect(machine.snapshot.data).toEqual({ name: "a" });

		actions.updateData((d) => ({ ...d, name: "b" }));
		expect(machine.snapshot.data).toEqual({ name: "b" });

		const calls = stateListener.mock.calls.length;
		// Object.is no-op guard: same value, no state change.
		actions.updateField("name", "b");
		expect(stateListener.mock.calls.length).toBe(calls);

		const canSubmit = vi.spyOn(machine, "canSubmit");
		await expect(actions.canSubmit()).resolves.toBe(await machine.canSubmit());
		expect(canSubmit).toHaveBeenCalledTimes(2);
	});

	it("cancel() delegates to manager.runCancel", async () => {
		const { machine, manager, actions } = setup();
		const runCancel = vi.spyOn(manager, "runCancel");
		await actions.goNext();

		await actions.cancel();

		expect(runCancel).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.currentStepId).toBe("step1");
	});
});
