import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

type Data = { name: string };

function createManager() {
	const definition = createLinearWizard<Data>({
		id: "track-loading",
		steps: [{ id: "a" }, { id: "b" }],
	});
	const machine = new WizardMachine<Data>(definition, {}, { name: "" });
	const manager = new WizardStateManager<Data>(
		machine,
		definition.initialStepId,
	);
	return { machine, manager };
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

/** Counts "loading"-channel notifications only. */
function spyLoading(manager: WizardStateManager<Data>) {
	const listener = vi.fn();
	manager.subscribe(listener, "loading");
	return listener;
}

describe("WizardStateManager.trackLoading", () => {
	it("sets the flag synchronously and clears it when fn settles", async () => {
		const { manager } = createManager();
		const d = deferred<string>();

		const run = manager.trackLoading("isNavigating", () => d.promise);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		d.resolve("done");
		await expect(run).resolves.toBe("done");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("propagates rejections and still releases the flag", async () => {
		const { manager } = createManager();
		const boom = new Error("boom");

		await expect(
			manager.trackLoading("isSubmitting", async () => {
				throw boom;
			}),
		).rejects.toBe(boom);
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(false);
	});

	it("keeps the flag on until every overlapping call settles (either order)", async () => {
		const { manager } = createManager();
		const a = deferred();
		const b = deferred();

		const runA = manager.trackLoading("isValidating", () => a.promise);
		const runB = manager.trackLoading("isValidating", () => b.promise);

		a.resolve();
		await runA;
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);

		b.resolve();
		await runB;
		expect(manager.getLoadingSnapshot().isValidating).toBe(false);
	});

	it("a rejected overlapping call does not clear another call's flag", async () => {
		const { manager } = createManager();
		const a = deferred();
		const b = deferred();

		const runA = manager.trackLoading("isNavigating", () => a.promise);
		const runB = manager.trackLoading("isNavigating", () => b.promise);

		b.reject(new Error("busy"));
		await expect(runB).rejects.toThrow("busy");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		a.resolve();
		await runA;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("counts flags independently", async () => {
		const { manager } = createManager();
		const nav = deferred();
		const val = deferred();

		const runNav = manager.trackLoading("isNavigating", () => nav.promise);
		const runVal = manager.trackLoading("isValidating", () => val.promise);

		val.resolve();
		await runVal;
		expect(manager.getLoadingSnapshot()).toEqual({
			isNavigating: true,
			isValidating: false,
			isSubmitting: false,
		});

		nav.resolve();
		await runNav;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("notifies the loading channel only when the boolean actually changes", async () => {
		const { manager } = createManager();
		const listener = spyLoading(manager);
		const a = deferred();
		const b = deferred();

		const runA = manager.trackLoading("isValidating", () => a.promise);
		expect(listener).toHaveBeenCalledTimes(1); // false -> true
		const before = manager.getLoadingSnapshot();

		const runB = manager.trackLoading("isValidating", () => b.promise);
		expect(listener).toHaveBeenCalledTimes(1); // still true: no notify
		expect(manager.getLoadingSnapshot()).toBe(before); // cache ref stable

		a.resolve();
		await runA;
		expect(listener).toHaveBeenCalledTimes(1); // still true: no notify

		b.resolve();
		await runB;
		expect(listener).toHaveBeenCalledTimes(2); // true -> false
	});

	it("does not notify when the flag was already forced on via setLoadingState", async () => {
		const { manager } = createManager();
		manager.setLoadingState({ isSubmitting: true });
		const listener = spyLoading(manager);

		const d = deferred();
		const run = manager.trackLoading("isSubmitting", () => d.promise);
		expect(listener).not.toHaveBeenCalled();

		d.resolve();
		await run;
		expect(listener).toHaveBeenCalledTimes(1);
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(false);
	});

	it.each([
		["runReset", (m: WizardStateManager<Data>) => m.runReset()],
		["runCancel", (m: WizardStateManager<Data>) => m.runCancel()],
		[
			"runRestore",
			(m: WizardStateManager<Data>) => m.runRestore(m.getMachine().serialize()),
		],
	] as const)("%s forces flags off and zeroes counters: in-flight calls settling later do not go negative", async (_name, force) => {
		const { manager } = createManager();
		const a = deferred();
		const b = deferred();

		const runA = manager.trackLoading("isNavigating", () => a.promise);
		const runB = manager.trackLoading("isNavigating", () => b.promise);

		await force(manager);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);

		a.resolve();
		b.resolve();
		await Promise.all([runA, runB]);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);

		// A new call after the force-off still toggles normally: the stale
		// settles above did not drive the counter below zero.
		const c = deferred();
		const runC = manager.trackLoading("isNavigating", () => c.promise);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);
		c.resolve();
		await runC;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("a stale call settling after reset does not steal a fresh call's reference", async () => {
		const { manager } = createManager();
		const stale = deferred();
		const fresh = deferred();

		const runStale = manager.trackLoading("isValidating", () => stale.promise);
		await manager.runReset();

		const runFresh = manager.trackLoading("isValidating", () => fresh.promise);
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);

		stale.resolve();
		await runStale;
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);

		fresh.resolve();
		await runFresh;
		expect(manager.getLoadingSnapshot().isValidating).toBe(false);
	});

	it("an in-flight call settling while runCancel awaits its handler does not clear cancel's isNavigating", async () => {
		const definition = createLinearWizard<Data>({
			id: "track-loading-cancel",
			steps: [{ id: "a" }, { id: "b" }],
		});
		const handler = deferred();
		const machine = new WizardMachine<Data>(
			definition,
			{},
			{ name: "" },
			{ onCancel: () => handler.promise },
		);
		const manager = new WizardStateManager<Data>(
			machine,
			definition.initialStepId,
		);
		const inFlight = deferred();

		const run = manager.trackLoading("isNavigating", () => inFlight.promise);
		const cancelling = manager.runCancel();
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		inFlight.resolve();
		await run;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);

		handler.resolve();
		await cancelling;
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("setLoadingState keeps its unconditional notify behaviour", () => {
		const { manager } = createManager();
		const listener = spyLoading(manager);

		manager.setLoadingState({ isNavigating: false });
		manager.setLoadingState({ isNavigating: false });
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
