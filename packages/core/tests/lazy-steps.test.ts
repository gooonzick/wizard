import { describe, expect, it, vi } from "vitest";
import {
	WizardNavigationError,
	WizardStepLoadError,
	WizardValidationError,
} from "../src/errors";
import {
	type WizardEvents,
	WizardMachine,
	type WizardSerializedState,
	type WizardState,
} from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import type { WizardDefinition } from "../src/types/definition";
import type {
	LazyStepImplementation,
	StepLoader,
	WizardStepDefinition,
} from "../src/types/step";

type Data = { name: string; passport: string };
const initialData: Data = { name: "", passport: "" };

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<V = void>() {
	let resolve!: (v: V) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<V>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** A loader whose every call parks on a fresh deferred the test settles. */
function controlledLoader(impl: LazyStepImplementation<Data> = {}) {
	const pending: Array<
		ReturnType<typeof deferred<LazyStepImplementation<Data>>>
	> = [];
	const load = vi.fn(() => {
		const d = deferred<LazyStepImplementation<Data>>();
		pending.push(d);
		return d.promise;
	});
	return {
		load: load as unknown as StepLoader<Data> & typeof load,
		resolve: (i = pending.length - 1) => pending[i].resolve(impl),
		reject: (
			error: unknown = new Error("chunk failed"),
			i = pending.length - 1,
		) => pending[i].reject(error),
	};
}

/** account -> documents (lazy) -> summary */
function lazyDefinition(
	load: StepLoader<Data>,
	documents: Partial<WizardStepDefinition<Data>> = {},
): WizardDefinition<Data> {
	return {
		id: "lazy",
		initialStepId: "account",
		steps: {
			account: { id: "account", next: { type: "static", to: "documents" } },
			documents: {
				id: "documents",
				previous: { type: "static", to: "account" },
				next: { type: "static", to: "summary" },
				meta: { title: "Documents" },
				load,
				...documents,
			},
			summary: { id: "summary", previous: { type: "static", to: "documents" } },
		},
	};
}

function createMachine(
	definition: WizardDefinition<Data>,
	events: WizardEvents<Data> = {},
	plugins?: WizardPlugin<Data>[],
) {
	const states: Array<
		Pick<WizardState<Data>, "currentStepId" | "isLoadingStep">
	> = [];
	const machine = new WizardMachine<Data>(
		definition,
		{},
		initialData,
		{
			...events,
			onStateChange: (s) => {
				states.push({
					currentStepId: s.currentStepId,
					isLoadingStep: s.isLoadingStep,
				});
				events.onStateChange?.(s);
			},
		},
		plugins,
	);
	return { machine, states };
}

const documentsSnapshot: WizardSerializedState<Data> = {
	version: 1,
	currentStepId: "documents",
	data: initialData,
	isValid: true,
	isCompleted: false,
	stepStatuses: {
		account: "completed",
		documents: "active",
		summary: "pristine",
	},
	visitedSteps: ["account", "documents"],
	history: ["account", "documents"],
};

describe("WIZ-013 lazy steps — plumbing", () => {
	it("snapshot.isLoadingStep starts false and is not serialized", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect("isLoadingStep" in machine.serialize()).toBe(false);
	});

	it("currentStep is the skeleton before load and the merged definition after", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ validate }))),
		);
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		expect(machine.currentStep.validate).toBeUndefined();
		expect(machine.currentStep.meta?.title).toBe("Documents");

		await machine.preloadStep("documents");
		expect(machine.currentStep.validate).toBe(validate);
	});

	it("preloadStep never flips isLoadingStep and later navigation reuses the load", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await flush();
		const before = states.length;

		await machine.preloadStep("documents");
		expect(states.length).toBe(before);
		expect(load).toHaveBeenCalledTimes(1);

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).toHaveBeenCalledTimes(1);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
	});

	it("isLoadingStep flips do not invalidate the cached progress", async () => {
		const run = async (lazy: boolean) => {
			const when = vi.fn(() => true);
			const def = lazyDefinition(vi.fn(async () => ({})));
			def.steps.account.next = {
				type: "conditional",
				branches: [{ when, to: "documents" }],
			};
			if (!lazy) {
				delete def.steps.documents.load;
			}
			const emitted: WizardState<Data>[] = [];
			const machine = new WizardMachine<Data>(def, {}, initialData, {
				onStateChange: (s) => emitted.push(s),
			});
			await flush();
			emitted.length = 0;
			when.mockClear();
			await machine.goNext();
			return { emitted, whenCalls: when.mock.calls.length };
		};

		const lazy = await run(true);
		const eager = await run(false);

		expect(lazy.emitted.map((s) => s.isLoadingStep)).toEqual([
			false, // validate()
			true,
			false,
			false, // navigation commit
		]);
		// The flag flips reuse the progress object of the preceding emission…
		expect(lazy.emitted[1].progress).toBe(lazy.emitted[0].progress);
		expect(lazy.emitted[2].progress).toBe(lazy.emitted[0].progress);
		// …so progress (and its sync branch predicates) is not recomputed.
		expect(lazy.whenCalls).toBe(eager.whenCalls);
	});

	it("preloadStep of the CURRENT step emits one onStateChange once its definition is replaced", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const { machine, states } = createMachine(
			lazyDefinition(vi.fn(async () => ({ validate }))),
			{
				onStateChange: () => {
					seen.push(machine.currentStep.validate);
				},
			},
		);
		const seen: unknown[] = [];
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		states.length = 0;
		seen.length = 0;

		await machine.preloadStep("documents");
		expect(states).toEqual([
			{ currentStepId: "documents", isLoadingStep: false },
		]);
		expect(seen).toEqual([validate]);

		// Already loaded: nothing to replace, no emission.
		await machine.preloadStep("documents");
		expect(states).toHaveLength(1);
	});

	it("preloadStep of the current step joining a foreground load adds no extra emission", async () => {
		const loader = controlledLoader({ validate: () => ({ valid: true }) });
		const { machine, states } = createMachine(lazyDefinition(loader.load));
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		states.length = 0;

		const v = machine.validate();
		const pre = machine.preloadStep("documents");
		await flush();
		loader.resolve();
		await Promise.all([v, pre]);
		await flush();
		expect(loader.load).toHaveBeenCalledTimes(1);
		expect(states.map((s) => s.isLoadingStep)).toEqual([
			true,
			false,
			false, // validate()
		]);
	});

	it("preloadStep rejects for an unknown step id", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		const error = await machine.preloadStep("nope").catch((e) => e);
		expect(error).toBeInstanceOf(WizardNavigationError);
		expect(error.reason).toBe("not-found");
	});

	it("preloadStep failure rejects without onError, and the next attempt retries", async () => {
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({});
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), { onError });

		await expect(machine.preloadStep("documents")).rejects.toBeInstanceOf(
			WizardStepLoadError,
		);
		expect(onError).not.toHaveBeenCalled();

		await machine.preloadStep("documents");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("preloadStep resolves immediately for steps without load", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await expect(machine.preloadStep("account")).resolves.toBeUndefined();
	});

	it("progress, isLastStep and getAvailableSteps do not trigger loads", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		const eager = createMachine(lazyDefinition(undefined as never)).machine;
		await flush();

		expect(machine.snapshot.progress).toEqual(eager.snapshot.progress);
		expect(await machine.getAvailableSteps()).toEqual(
			await eager.getAvailableSteps(),
		);
		expect(load).not.toHaveBeenCalled();
	});

	it("goTo with skipLifecycle does not load the target", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).not.toHaveBeenCalled();
	});
});

describe("WIZ-013 lazy steps — navigation", () => {
	it("loads the target on first entry, runs the loaded onEnter, and flips isLoadingStep around the commit", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onStepEnter = vi.fn();
		const { machine, states } = createMachine(lazyDefinition(loader.load), {
			onStepEnter,
		});
		await flush();
		states.length = 0;

		const p = machine.goNext();
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(true);
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(machine.isBusy).toBe(true);

		loader.resolve();
		await p;

		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledWith("documents", initialData);
		expect(states).toEqual([
			{ currentStepId: "account", isLoadingStep: false }, // validate()
			{ currentStepId: "account", isLoadingStep: true },
			{ currentStepId: "account", isLoadingStep: false },
			{ currentStepId: "documents", isLoadingStep: false },
		]);
	});

	it("does not reload on repeated navigation (including after reset) and adds no emissions for loaded steps", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await machine.goNext();
		await machine.goPrevious();
		machine.reset();
		await flush();
		states.length = 0;

		await machine.goNext();
		expect(load).toHaveBeenCalledTimes(1);
		expect(states.every((s) => !s.isLoadingStep)).toBe(true);
	});

	it("target load failure: rejects with WizardStepLoadError, reports phase 'load' once, stays put, retry succeeds", async () => {
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("chunk failed"))
			.mockResolvedValue({});
		const onError = vi.fn();
		const pluginError = vi.fn();
		const beforeTransition = vi.fn(() => true);
		const accountLeave = vi.fn();
		const def = lazyDefinition(load);
		def.steps.account.onLeave = accountLeave;
		const { machine } = createMachine(def, { onError }, [
			{ name: "spy", onError: pluginError, beforeTransition },
		]);
		await flush();

		const error = await machine.goNext().catch((e) => e);
		expect(error).toBeInstanceOf(WizardStepLoadError);
		expect(error.stepId).toBe("documents");
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(error);
		expect(pluginError).toHaveBeenCalledTimes(1);
		expect(pluginError.mock.calls[0][1]).toMatchObject({
			phase: "load",
			stepId: "documents",
		});
		expect(beforeTransition).not.toHaveBeenCalled();
		expect(accountLeave).not.toHaveBeenCalled();
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(machine.snapshot.isLoadingStep).toBe(false);

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("loaded hooks compose with skeleton hooks (skeleton first); absent loaded hooks keep the skeleton's", async () => {
		const skeletonEnter = vi.fn();
		const loadedEnter = vi.fn();
		const skeletonValidate = vi.fn(() => ({ valid: true }));
		const { machine } = createMachine(
			lazyDefinition(
				vi.fn(async () => ({ onEnter: loadedEnter })),
				{
					onEnter: skeletonEnter,
					validate: skeletonValidate,
				},
			),
		);
		await machine.goNext();
		await machine.goNext();

		expect(loadedEnter).toHaveBeenCalledTimes(1);
		expect(skeletonEnter).toHaveBeenCalledTimes(1);
		expect(skeletonEnter.mock.invocationCallOrder[0]).toBeLessThan(
			loadedEnter.mock.invocationCallOrder[0],
		);
		expect(skeletonValidate).toHaveBeenCalled();
	});

	it("accepts a module namespace with a default export", async () => {
		const onEnter = vi.fn();
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ default: { onEnter } }))),
		);
		await machine.goNext();
		expect(onEnter).toHaveBeenCalledTimes(1);
	});

	it("goPrevious from an unloaded lazy current step loads it to run its onLeave", async () => {
		const onLeave = vi.fn();
		const load = vi.fn(async () => ({ onLeave }));
		const { machine } = createMachine(lazyDefinition(load));
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		await machine.goPrevious();
		expect(load).toHaveBeenCalledTimes(1);
		expect(onLeave).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.currentStepId).toBe("account");
	});

	it("leaving an unloaded current step whose load fails is not blocked: reported once, skeleton onLeave runs", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const skeletonLeave = vi.fn();
		const onError = vi.fn();
		const onStepLeave = vi.fn();
		const pluginError = vi.fn();
		const { machine } = createMachine(
			lazyDefinition(load, { onLeave: skeletonLeave }),
			{ onError, onStepLeave },
			[{ name: "spy", onError: pluginError }],
		);
		await flush();
		machine.restore(documentsSnapshot);
		await flush(); // restore's validate() load fails and is reported
		onError.mockClear();
		pluginError.mockClear();

		await machine.goPrevious();

		expect(machine.snapshot.currentStepId).toBe("account");
		expect(load).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardStepLoadError);
		expect(onError.mock.calls[0][0].stepId).toBe("documents");
		expect(pluginError).toHaveBeenCalledTimes(1);
		expect(pluginError.mock.calls[0][1]).toMatchObject({
			phase: "load",
			stepId: "documents",
		});
		expect(skeletonLeave).toHaveBeenCalledTimes(1);
		expect(onStepLeave).toHaveBeenCalledWith("documents", initialData);
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});

	it("a failing TARGET load still blocks even when the current step's load fails too", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const def = lazyDefinition(load);
		const summaryLoad = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValue(new Error("summary down"));
		def.steps.summary.load = summaryLoad;
		const onStepLeave = vi.fn();
		const { machine } = createMachine(def, { onStepLeave });
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});

		const error = await machine
			.goTo("summary", { skipValidation: true })
			.catch((e) => e);
		expect(error).toBeInstanceOf(WizardStepLoadError);
		expect(error.stepId).toBe("summary");
		expect(onStepLeave).not.toHaveBeenCalled();
		expect(machine.snapshot.currentStepId).toBe("documents");
	});

	it("current-step load failure: goNext/goTo/submit reject with WizardStepLoadError, step not marked 'error'", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), { onError });
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});

		for (const run of [
			() => machine.goNext(),
			() => machine.goTo("account"),
			() => machine.submit(),
		]) {
			onError.mockClear();
			const error = await run().catch((e) => e);
			expect(error).toBeInstanceOf(WizardStepLoadError);
			expect(error).not.toBeInstanceOf(WizardValidationError);
			// once per operation (each operation is a fresh failed attempt)
			expect(onError).toHaveBeenCalledTimes(1);
			expect(machine.snapshot.stepStatuses.documents).not.toBe("error");
			expect(machine.snapshot.currentStepId).toBe("documents");
		}
	});

	it("regression: non-lazy wizards gain no await — goNext() then a synchronous reset() still supersedes validation", async () => {
		const onValidation = vi.fn();
		const def: WizardDefinition<Data> = {
			id: "eager",
			initialStepId: "a",
			steps: {
				a: {
					id: "a",
					validate: (d) =>
						d.name
							? { valid: true }
							: { valid: false, errors: { name: "req" } },
					next: { type: "static", to: "b" },
				},
				b: { id: "b" },
			},
		};
		const { machine } = createMachine(def, { onValidation });
		await flush();

		const p = machine.goNext().catch(() => {});
		machine.reset();
		await p;
		await flush();
		expect(onValidation).not.toHaveBeenCalled();
		expect(machine.snapshot.validationErrors).toBeUndefined();
	});

	it("regression: non-lazy wizards run validate() synchronously in goNext/goTo/submit (no added microtask)", async () => {
		for (const run of [
			(m: WizardMachine<Data>) => m.goNext(),
			(m: WizardMachine<Data>) => m.goTo("b"),
			(m: WizardMachine<Data>) => m.submit(),
		]) {
			const validate = vi.fn(() => ({
				valid: false,
				errors: { name: "req" },
			}));
			const def: WizardDefinition<Data> = {
				id: "eager",
				initialStepId: "a",
				steps: {
					a: { id: "a", validate, next: { type: "static", to: "b" } },
					b: { id: "b" },
				},
			};
			const { machine } = createMachine(def);
			await flush();

			const p = run(machine).catch(() => {});
			expect(validate).toHaveBeenCalledTimes(1);
			await p;
		}
	});

	it("after destroy(), a lazy goNext() never flips isLoadingStep to true", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await flush();
		await machine.destroy();
		states.length = 0;

		await machine.goNext().catch(() => {});
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
	});

	it("canSubmit() on an unloaded lazy last step loads in the background: no isLoadingStep, no onError, false on failure", async () => {
		const def = lazyDefinition(vi.fn(async () => ({})));
		def.steps.summary.load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValue(new Error("down"));
		const onError = vi.fn();
		const { machine, states } = createMachine(def, { onError });
		await machine.goTo("summary", {
			skipValidation: true,
			skipLifecycle: true,
		});
		states.length = 0;

		await expect(machine.canSubmit()).resolves.toBe(false);
		expect(def.steps.summary.load).toHaveBeenCalledTimes(1);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
		expect(onError).not.toHaveBeenCalled();
	});

	it("canSubmit() returns true once a valid lazy last step loads in the background", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const def = lazyDefinition(vi.fn(async () => ({})));
		def.steps.summary.load = vi.fn(async () => ({ validate }));
		const { machine, states } = createMachine(def);
		await machine.goTo("summary", {
			skipValidation: true,
			skipLifecycle: true,
		});
		states.length = 0;

		await expect(machine.canSubmit()).resolves.toBe(true);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
	});

	it("submit() on a lazy last step runs the LOADED onSubmit", async () => {
		const onSubmit = vi.fn();
		const def = lazyDefinition(vi.fn(async () => ({})));
		def.steps.summary.load = vi.fn(async () => ({ onSubmit }));
		const { machine } = createMachine(def);
		await machine.goTo("summary", {
			skipValidation: true,
			skipLifecycle: true,
		});

		await machine.submit();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.isCompleted).toBe(true);
	});
});

describe("WIZ-013 lazy steps — initial step, validate, restore", () => {
	function lazyInitialDefinition(
		load: StepLoader<Data>,
	): WizardDefinition<Data> {
		return {
			id: "lazy-initial",
			initialStepId: "start",
			steps: {
				start: { id: "start", load, next: { type: "static", to: "end" } },
				optional: {
					id: "optional",
					enabled: () => false,
					next: { type: "static", to: "end" },
				},
				end: { id: "end" },
			},
		};
	}

	it("loads a lazy initial step, then runs its onEnter and onStepEnter", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onStepEnter = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(loader.load), {
			onStepEnter,
		});
		expect(machine.snapshot.isLoadingStep).toBe(true);

		loader.resolve();
		await flush();
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledWith("start", initialData);
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});

	it("initial load failure: reported, guard statuses still computed; a later validate() loads the step and replays its entry once, before the validator", async () => {
		const onEnter = vi.fn();
		const validate = vi.fn(() => ({ valid: true }));
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({ onEnter, validate });
		const onError = vi.fn();
		const onStepEnter = vi.fn();
		const pluginError = vi.fn();
		const { machine } = createMachine(
			lazyInitialDefinition(load),
			{ onError, onStepEnter },
			[{ name: "spy", onError: pluginError }],
		);
		await flush();

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardStepLoadError);
		expect(pluginError.mock.calls[0][1]).toMatchObject({ phase: "load" });
		expect(onStepEnter).not.toHaveBeenCalled();
		expect(machine.snapshot.stepStatuses.optional).toBe("skipped");
		expect(machine.snapshot.isLoadingStep).toBe(false);

		await machine.validate();
		expect(load).toHaveBeenCalledTimes(2);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledWith("start", initialData);
		expect(onEnter.mock.invocationCallOrder[0]).toBeLessThan(
			onStepEnter.mock.invocationCallOrder[0],
		);
		expect(onStepEnter.mock.invocationCallOrder[0]).toBeLessThan(
			validate.mock.invocationCallOrder[0],
		);

		await machine.validate();
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("end");
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledTimes(2); // start (replayed), end
	});

	it("initial load failure: goNext() loads the step and replays its entry before navigating", async () => {
		const onEnter = vi.fn();
		const validate = vi.fn(() => ({ valid: true }));
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({ onEnter, validate });
		const onStepEnter = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(load), {
			onStepEnter,
		});
		await flush();

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("end");
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter.mock.calls.map((c) => c[0])).toEqual(["start", "end"]);
		expect(onEnter.mock.invocationCallOrder[0]).toBeLessThan(
			validate.mock.invocationCallOrder[0],
		);
	});

	it("initial load failure: preloadStep() then goNext() replays the entry once", async () => {
		const onEnter = vi.fn();
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({ onEnter });
		const onStepEnter = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(load), {
			onStepEnter,
		});
		await flush();

		await machine.preloadStep("start");
		expect(onEnter).not.toHaveBeenCalled();

		await machine.goNext();
		expect(load).toHaveBeenCalledTimes(2);
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter.mock.calls.map((c) => c[0])).toEqual(["start", "end"]);
	});

	it("a replayed initial onEnter that throws is reported (phase 'lifecycle'), skips onStepEnter, and the operation continues", async () => {
		const onEnter = vi.fn(() => {
			throw new Error("enter boom");
		});
		const validate = vi.fn(() => ({ valid: true }));
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({ onEnter, validate });
		const onStepEnter = vi.fn();
		const pluginError = vi.fn();
		const { machine } = createMachine(
			lazyInitialDefinition(load),
			{ onStepEnter },
			[{ name: "spy", onError: pluginError }],
		);
		await flush();
		pluginError.mockClear();

		await expect(machine.validate()).resolves.toEqual({ valid: true });
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(onStepEnter).not.toHaveBeenCalled();
		expect(pluginError).toHaveBeenCalledTimes(1);
		expect(pluginError.mock.calls[0][1]).toMatchObject({ phase: "lifecycle" });

		await machine.validate();
		expect(onEnter).toHaveBeenCalledTimes(1);
	});

	it("reset() and restore() discard a pending initial entry", async () => {
		for (const supersede of [
			(m: WizardMachine<Data>) => m.reset(),
			(m: WizardMachine<Data>) =>
				m.restore({
					version: 1,
					currentStepId: "start",
					data: initialData,
					isValid: true,
					isCompleted: false,
					stepStatuses: { start: "active", optional: "skipped", end: "pristine" },
					visitedSteps: ["start"],
					history: ["start"],
				}),
		]) {
			const onEnter = vi.fn();
			const load = vi
				.fn<StepLoader<Data>>()
				.mockRejectedValueOnce(new Error("offline"))
				.mockResolvedValue({ onEnter });
			const { machine } = createMachine(lazyInitialDefinition(load));
			await flush();

			supersede(machine);
			await flush();
			// reset() re-enters the initial step itself (once); restore() never
			// enters it. Neither replays the superseded pending entry.
			const entered = onEnter.mock.calls.length;
			expect(entered).toBeLessThanOrEqual(1);

			await machine.validate();
			await machine.goNext();
			expect(onEnter).toHaveBeenCalledTimes(entered);
		}
	});

	it("restore() onto a lazy step starts the load; an explicit validate() joins it", async () => {
		const validate = vi.fn(() => ({
			valid: false,
			errors: { passport: "bad" },
		}));
		const loader = controlledLoader({ validate });
		const { machine, states } = createMachine(lazyDefinition(loader.load));
		await flush();

		machine.restore(documentsSnapshot);
		expect(machine.snapshot.isLoadingStep).toBe(true);
		const result = machine.validate();
		await flush();
		expect(loader.load).toHaveBeenCalledTimes(1);

		loader.resolve();
		await expect(result).resolves.toEqual({
			valid: false,
			errors: { passport: "bad" },
		});
		await flush();
		expect(validate).toHaveBeenCalledTimes(2); // restore's validate + explicit
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect(states.some((s) => s.isLoadingStep)).toBe(true);
	});

	it("validate() with a failing load: invalid result, reported once, no state write, no onValidation", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const onError = vi.fn();
		const onValidation = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), {
			onError,
			onValidation,
		});
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		const before = machine.snapshot;

		const result = await machine.validate();
		expect(result).toEqual({
			valid: false,
			errors: { general: "Failed to load step" },
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onValidation).not.toHaveBeenCalled();
		expect(machine.snapshot.isValid).toBe(before.isValid);
		expect(machine.snapshot.validationErrors).toBe(before.validationErrors);
	});
});

describe("WIZ-013 lazy steps — validateAll", () => {
	it("loads enabled lazy steps, skips disabled ones, and reports load failures as _error without plugin dispatch", async () => {
		const documentsValidate = vi.fn(() => ({
			valid: false,
			errors: { passport: "required" },
		}));
		const disabledLoad = vi.fn(async () => ({}));
		const failingLoad = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValue(new Error("x"));
		const def = lazyDefinition(
			vi.fn(async () => ({ validate: documentsValidate })),
		);
		def.steps.disabled = { id: "disabled", enabled: false, load: disabledLoad };
		def.steps.summary.load = failingLoad;
		const onError = vi.fn();
		const pluginError = vi.fn();
		const { machine, states } = createMachine(def, { onError }, [
			{ name: "spy", onError: pluginError },
		]);
		await flush();
		const before = states.length;

		const summary = await machine.validateAll();

		expect(disabledLoad).not.toHaveBeenCalled();
		expect(summary.steps.map((s) => s.stepId)).toEqual([
			"account",
			"documents",
			"summary",
		]);
		expect(summary.steps[1]).toMatchObject({
			valid: false,
			errors: { passport: "required" },
		});
		expect(summary.steps[2]).toMatchObject({
			valid: false,
			errors: { _error: 'Failed to load step "summary"' },
		});
		expect(summary.invalidStepIds).toEqual(["documents", "summary"]);
		expect(onError).not.toHaveBeenCalled();
		expect(pluginError).not.toHaveBeenCalled();
		expect(states.length).toBe(before); // no emission, no isLoadingStep flip
	});

	it("emits exactly one onStateChange when it loaded the CURRENT step (with or without a status write)", async () => {
		for (const updateStatuses of [false, true]) {
			const validate = vi.fn(() => ({
				valid: false,
				errors: { passport: "required" },
			}));
			const { machine, states } = createMachine(
				lazyDefinition(vi.fn(async () => ({ validate }))),
			);
			await machine.goTo("documents", {
				skipValidation: true,
				skipLifecycle: true,
			});
			states.length = 0;

			await machine.validateAll({ updateStatuses });
			expect(states).toEqual([
				{ currentStepId: "documents", isLoadingStep: false },
			]);
			expect(machine.currentStep.validate).toBe(validate);
			expect(machine.snapshot.stepStatuses.documents).toBe(
				updateStatuses ? "error" : "active",
			);
		}
	});
});

describe("WIZ-013 lazy steps — supersede, destroy, dedupe", () => {
	for (const [name, supersede] of [
		["reset()", (m: WizardMachine<Data>) => m.reset()],
		["cancel()", (m: WizardMachine<Data>) => void m.cancel()],
		[
			"restore()",
			(m: WizardMachine<Data>) =>
				m.restore({
					...documentsSnapshot,
					currentStepId: "account",
					history: ["account"],
					visitedSteps: ["account"],
					stepStatuses: {
						account: "active",
						documents: "pristine",
						summary: "pristine",
					},
				}),
		],
	] as const) {
		it(`${name} during a pending target load supersedes the transition`, async () => {
			const onEnter = vi.fn();
			const loader = controlledLoader({ onEnter });
			const onStepEnter = vi.fn();
			const onError = vi.fn();
			const { machine, states } = createMachine(lazyDefinition(loader.load), {
				onStepEnter,
				onError,
			});
			await flush();

			const p = machine.goNext();
			await flush();
			expect(machine.snapshot.isLoadingStep).toBe(true);
			supersede(machine);
			await flush();
			expect(machine.snapshot.isLoadingStep).toBe(false);
			const count = states.length;

			loader.resolve();
			await expect(p).resolves.toBeUndefined();
			await flush();
			expect(machine.snapshot.currentStepId).toBe("account");
			expect(onEnter).not.toHaveBeenCalled();
			expect(onStepEnter).not.toHaveBeenCalledWith(
				"documents",
				expect.anything(),
			);
			expect(states.length).toBe(count);
			expect(onError).not.toHaveBeenCalled();
		});
	}

	it("a superseded load FAILURE is not reported", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(loader.load), { onError });
		await flush();

		const p = machine.goNext();
		await flush();
		machine.reset();
		loader.reject();
		await expect(p).resolves.toBeUndefined();
		expect(onError).not.toHaveBeenCalled();
	});

	it("destroy() during a pending load: no navigation, hooks, emissions or reports", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onError = vi.fn();
		const { machine, states } = createMachine(lazyDefinition(loader.load), {
			onError,
		});
		await flush();

		const p = machine.goNext();
		await flush();
		await machine.destroy();
		const count = states.length;

		loader.resolve();
		await p;
		await flush();
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(onEnter).not.toHaveBeenCalled();
		expect(states.length).toBe(count);
		expect(onError).not.toHaveBeenCalled();
	});

	it("concurrent validate() + goNext() on an unloaded current step share one load", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const loader = controlledLoader({ validate });
		const { machine } = createMachine(lazyDefinition(loader.load));
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});

		const v = machine.validate();
		const n = machine.goNext();
		await flush();
		expect(loader.load).toHaveBeenCalledTimes(1);

		loader.resolve();
		await Promise.all([v, n]);
		expect(machine.snapshot.currentStepId).toBe("summary");
	});

	it("a failed attempt awaited by two callers is reported once", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(loader.load), { onError });
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});

		const v = machine.validate();
		const n = machine.goNext().catch((e) => e);
		await flush();
		loader.reject();
		await v;
		const error = await n;
		expect(error).toBeInstanceOf(WizardStepLoadError);
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it("a preload in flight that a navigation joins, then fails: onError once with phase 'load', the preload promise rejects with the same WizardStepLoadError instance, one loader call", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const pluginError = vi.fn();
		const { machine } = createMachine(
			lazyDefinition(loader.load),
			{ onError },
			[{ name: "spy", onError: pluginError }],
		);
		await flush();

		const pre = machine.preloadStep("documents");
		// Attach the handler up front so the rejection is never unhandled.
		const preError = pre.catch((e) => e);
		const nav = machine.goNext().catch((e) => e);
		await flush();
		loader.reject();

		const navError = await nav;
		expect(navError).toBeInstanceOf(WizardStepLoadError);
		expect(await preError).toBe(navError);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBe(navError);
		expect(pluginError).toHaveBeenCalledTimes(1);
		expect(pluginError.mock.calls[0][1]).toMatchObject({ phase: "load" });
		expect(loader.load).toHaveBeenCalledTimes(1);
	});
});

describe("WIZ-013 lazy steps — drift during a pending load", () => {
	function lazyInitialDefinition(
		load: StepLoader<Data>,
	): WizardDefinition<Data> {
		return {
			id: "lazy-initial",
			initialStepId: "start",
			steps: {
				start: { id: "start", load, next: { type: "static", to: "end" } },
				end: { id: "end" },
			},
		};
	}

	for (const [name, supersede] of [
		["reset()", (m: WizardMachine<Data>) => m.reset()],
		["destroy()", (m: WizardMachine<Data>) => m.destroy()],
	] as const) {
		it(`validateAll({ updateStatuses }) superseded by ${name} during the load does not write or emit`, async () => {
			const validate = vi.fn(() => ({
				valid: false,
				errors: { passport: "required" },
			}));
			const loader = controlledLoader({ validate });
			const { machine, states } = createMachine(lazyDefinition(loader.load));
			await flush();

			const p = machine.validateAll({ updateStatuses: true });
			await flush();
			expect(loader.load).toHaveBeenCalledTimes(1);
			await supersede(machine);
			await flush();
			const count = states.length;

			loader.resolve();
			const summary = await p;
			await flush();
			expect(summary.invalidStepIds).toEqual(["documents"]);
			expect(machine.snapshot.stepStatuses.documents).toBe("pristine");
			expect(states.length).toBe(count);
		});
	}

	it("validate() re-targets the new current step when the user left during the load", async () => {
		const documentsValidate = vi.fn(() => ({ valid: true }));
		const loader = controlledLoader({ validate: documentsValidate });
		const summaryValidate = vi.fn(() => ({
			valid: false,
			errors: { name: "required" },
		}));
		const def = lazyDefinition(loader.load);
		def.steps.summary.load = vi.fn(async () => ({ validate: summaryValidate }));
		const onValidation = vi.fn();
		const onError = vi.fn();
		const { machine, states } = createMachine(def, { onValidation, onError });
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});
		await machine.preloadStep("summary");

		const v = machine.validate();
		await flush();
		await machine.goTo("summary", {
			skipValidation: true,
			skipLifecycle: true,
		});
		const before = machine.snapshot;
		const count = states.length;

		expect(before.isValid).toBe(true);

		loader.resolve();
		const expected = { valid: false, errors: { name: "required" } };
		await expect(v).resolves.toEqual(expected);
		await flush();
		// The step the user left is not validated; the new current step is.
		expect(documentsValidate).not.toHaveBeenCalled();
		expect(summaryValidate).toHaveBeenCalledTimes(1);
		expect(onValidation).toHaveBeenCalledTimes(1);
		expect(onValidation).toHaveBeenCalledWith(expected);
		expect(onError).not.toHaveBeenCalled();
		expect(machine.snapshot.currentStepId).toBe("summary");
		expect(machine.snapshot.isValid).toBe(false);
		expect(machine.snapshot.validationErrors).toEqual({ name: "required" });
		// The foreground-load flag clears, then the re-targeted validation emits.
		expect(states.slice(count)).toEqual([
			{ currentStepId: "summary", isLoadingStep: false },
			{ currentStepId: "summary", isLoadingStep: false },
		]);
	});

	it("validate() still returns the superseded result when reset() lands during the load", async () => {
		const documentsValidate = vi.fn(() => ({ valid: true }));
		const loader = controlledLoader({ validate: documentsValidate });
		const onValidation = vi.fn();
		const { machine } = createMachine(lazyDefinition(loader.load), {
			onValidation,
		});
		await machine.goTo("documents", {
			skipValidation: true,
			skipLifecycle: true,
		});

		const v = machine.validate();
		await flush();
		machine.reset();
		loader.resolve();
		await expect(v).resolves.toEqual({
			valid: false,
			errors: { general: "Validation error occurred" },
		});
		expect(documentsValidate).not.toHaveBeenCalled();
		expect(onValidation).not.toHaveBeenCalled();
	});

	it("the initial step is not entered after the user left it during its load", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onStepEnter = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(loader.load), {
			onStepEnter,
		});

		await machine.goTo("end", { skipValidation: true, skipLifecycle: true });
		loader.resolve();
		await flush();
		expect(machine.snapshot.currentStepId).toBe("end");
		expect(onEnter).not.toHaveBeenCalled();
		expect(onStepEnter).not.toHaveBeenCalledWith("start", expect.anything());
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});

	it("a NON-lazy initial step keeps its behaviour: onStepEnter still fires after an async onEnter even if the user left", async () => {
		const gate = deferred();
		const onEnter = vi.fn(() => gate.promise);
		const onStepEnter = vi.fn();
		const { machine } = createMachine(
			{
				id: "eager-initial",
				initialStepId: "start",
				steps: {
					start: { id: "start", onEnter, next: { type: "static", to: "end" } },
					end: { id: "end" },
				},
			},
			{ onStepEnter },
		);
		expect(onEnter).toHaveBeenCalledTimes(1);

		await machine.goTo("end", { skipValidation: true, skipLifecycle: true });
		gate.resolve();
		await flush();
		expect(machine.snapshot.currentStepId).toBe("end");
		expect(onStepEnter).toHaveBeenCalledWith("start", initialData);
	});

	it("an initial load failure for a step the user already left is not reported", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(loader.load), {
			onError,
		});

		await machine.goTo("end", { skipValidation: true, skipLifecycle: true });
		loader.reject();
		await flush();
		expect(machine.snapshot.currentStepId).toBe("end");
		expect(onError).not.toHaveBeenCalled();
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});

	it("reset() during the constructor's pending initial load enters once and clears isLoadingStep", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const { machine } = createMachine(lazyInitialDefinition(loader.load));
		expect(machine.snapshot.isLoadingStep).toBe(true);

		machine.reset();
		loader.resolve();
		await flush();
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(loader.load).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});
});
