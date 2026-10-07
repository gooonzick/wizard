import {
	type StepLoader,
	type WizardDefinition,
	WizardMachine,
} from "@gooonzick/wizard-core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createWizardActions } from "../src/actions";
import { WizardStateManager } from "../src/manager";

type Data = { name: string };
const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<V>() {
	let resolve!: (v: V) => void;
	const promise = new Promise<V>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function setup(initialLazy = false) {
	const gate = deferred<{ onEnter?: () => void }>();
	const load = vi.fn(() => gate.promise) as unknown as StepLoader<Data>;
	const definition: WizardDefinition<Data> = {
		id: "state-lazy",
		initialStepId: "a",
		steps: {
			a: {
				id: "a",
				next: { type: "static", to: "b" },
				...(initialLazy ? { load } : {}),
			},
			b: { id: "b", load: initialLazy ? undefined : load },
		},
	};
	let manager!: WizardStateManager<Data>;
	const machine = new WizardMachine<Data>(
		definition,
		{},
		{ name: "" },
		{
			onStateChange: (s) =>
				manager?.handleStateChange(s, manager.getSnapshot()),
		},
	);
	manager = new WizardStateManager<Data>(machine, "a");
	return { machine, manager, gate, load };
}

describe("WizardStateManager — isLoadingStep (WIZ-013)", () => {
	it("mirrors the machine flag and notifies the loading channel", async () => {
		const { machine, manager, gate } = setup();
		await flush();
		const onLoading = vi.fn();
		manager.subscribe(onLoading, "loading");

		const p = machine.goNext();
		await flush();
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
		expect(onLoading).toHaveBeenCalled();
		const callsWhileLoading = onLoading.mock.calls.length;

		gate.resolve({});
		await p;
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(false);
		expect(onLoading.mock.calls.length).toBeGreaterThan(callsWhileLoading);
	});

	it("is seeded from the snapshot when the initial step is lazy", () => {
		const { manager } = setup(true);
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
	});

	it("refreshes currentStep in the state slice when a step finishes loading in place", async () => {
		const { manager, gate } = setup(true);
		const onEnter = vi.fn();
		const onState = vi.fn();
		manager.subscribe(onState, "state");
		const skeleton = manager.getStateSnapshot().currentStep;
		gate.resolve({ onEnter });
		await flush();
		expect(onState).toHaveBeenCalled();
		expect(manager.getStateSnapshot().currentStep).not.toBe(skeleton);
		expect(manager.getStateSnapshot().currentStep.onEnter).toBe(onEnter);
	});

	it("refreshes currentStep when a background preload replaces the current definition", async () => {
		const onEnter = vi.fn();
		const load = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ onEnter }) as unknown as StepLoader<Data>;
		const definition: WizardDefinition<Data> = {
			id: "state-lazy-bg",
			initialStepId: "a",
			steps: { a: { id: "a", load } },
		};
		let manager!: WizardStateManager<Data>;
		const machine = new WizardMachine<Data>(
			definition,
			{},
			{ name: "" },
			{
				onError: () => {},
				onStateChange: (s) =>
					manager?.handleStateChange(s, manager.getSnapshot()),
			},
		);
		manager = new WizardStateManager<Data>(machine, "a");
		await flush();
		// The initial load failed: the current step is still the skeleton.
		const skeleton = manager.getStateSnapshot().currentStep;
		expect(skeleton.onEnter).toBeUndefined();
		const onState = vi.fn();
		manager.subscribe(onState, "state");

		await machine.preloadStep("a");

		expect(onState).toHaveBeenCalled();
		const merged = manager.getStateSnapshot().currentStep;
		expect(merged).not.toBe(skeleton);
		expect(merged.onEnter).toBe(onEnter);
	});

	it("is untouched by trackLoading and forceLoadingOff paths", async () => {
		const { machine, manager } = setup();
		await flush();
		void machine.goNext();
		await flush();
		await manager.trackLoading("isValidating", async () => {});
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
	});

	it("trackLoading does not accept isLoadingStep", () => {
		type Flag = Parameters<WizardStateManager<Data>["trackLoading"]>[0];
		expectTypeOf<"isLoadingStep">().not.toMatchTypeOf<Flag>();
	});

	it("setLoadingState rejects the machine-owned isLoadingStep flag", () => {
		type Update = Parameters<WizardStateManager<Data>["setLoadingState"]>[0];
		expectTypeOf<{ isNavigating: true }>().toMatchTypeOf<Update>();
		expectTypeOf<{ isLoadingStep: true }>().not.toMatchTypeOf<Update>();
	});

	it("actions.preloadStep never rejects; the machine's preloadStep still does", async () => {
		const load = vi
			.fn()
			.mockRejectedValue(new Error("offline")) as unknown as StepLoader<Data>;
		const definition: WizardDefinition<Data> = {
			id: "state-lazy-fail",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		const machine = new WizardMachine<Data>(definition, {}, { name: "" });
		const manager = new WizardStateManager<Data>(machine, "a");
		const actions = createWizardActions(manager, () => {});

		await expect(machine.preloadStep("b")).rejects.toThrow(/offline/);
		await expect(actions.preloadStep("b")).resolves.toBeUndefined();
		await expect(actions.preloadStep("missing")).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(2);
		expectTypeOf(actions.preloadStep).returns.toEqualTypeOf<Promise<void>>();
	});

	it("actions.preloadStep delegates to the machine without loading flags", async () => {
		const { manager, gate, load } = setup();
		await flush();
		const actions = createWizardActions(manager, () => {});
		const p = actions.preloadStep("b");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(false);
		gate.resolve({});
		await p;
		expect(load).toHaveBeenCalledTimes(1);
	});
});
