import { describe, expect, it, vi } from "vitest";
import { WizardNavigationError, WizardValidationError } from "../src/errors";
import { WizardMachine, type WizardState } from "../src/machine/wizard-machine";
import type { PersistedWizardSnapshot } from "../src/plugins/persistence";
import { createPersistencePlugin } from "../src/plugins/persistence";
import { PluginHost } from "../src/plugins/plugin-host";
import type { TransitionEvent, WizardPlugin } from "../src/plugins/types";
import type { ValidationResult } from "../src/types/base";
import type { WizardDefinition } from "../src/types/definition";
import {
	createSimpleLinearDefinition,
	createValidatedDefinition,
	type SimpleData,
} from "./fixtures";

interface D extends Record<string, unknown> {
	name: string;
	flag?: boolean;
	s1On?: boolean;
}

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

/** s1 -> s2 -> s3; s2's validator is gated by `gate`, s3's guard by `guard`. */
function staleDefinition(
	gates: {
		validation?: Promise<ValidationResult>;
		guard?: Promise<boolean>;
	},
	spies: { s1Submit: () => void; s2Submit: () => void },
): WizardDefinition<D> {
	return {
		id: "stale",
		initialStepId: "s1",
		steps: {
			s1: {
				id: "s1",
				onSubmit: spies.s1Submit,
				next: { type: "static", to: "s2" },
			},
			s2: {
				id: "s2",
				validate: () => gates.validation ?? { valid: true },
				onSubmit: spies.s2Submit,
				next: { type: "static", to: "s3" },
			},
			s3: {
				id: "s3",
				enabled: () => gates.guard ?? true,
			},
		},
	};
}

describe("review fixes — core machine", () => {
	// ── #1 stale transition after validate ────────────────────────────
	describe("#1 reset() during an awaited validator supersedes the transition", () => {
		const setup = () => {
			const gate = deferred<ValidationResult>();
			const gates: { validation?: Promise<ValidationResult> } = {};
			const s1Submit = vi.fn();
			const s2Submit = vi.fn();
			const onSubmit = vi.fn();
			const onError = vi.fn();
			const onStepEnter = vi.fn();
			const m = new WizardMachine<D>(
				staleDefinition(gates, { s1Submit, s2Submit }),
				{},
				{ name: "" },
				{ onSubmit, onError, onStepEnter },
			);
			return {
				m,
				gate,
				arm: () => {
					gates.validation = gate.promise;
				},
				s1Submit,
				s2Submit,
				onSubmit,
				onError,
				onStepEnter,
			};
		};

		it("goNext does not run the reset step's onSubmit (valid result)", async () => {
			const t = setup();
			await t.m.goTo("s2", { skipValidation: true });
			t.arm();
			const p = t.m.goNext();
			await Promise.resolve();
			t.m.reset();
			t.gate.resolve({ valid: true });
			await expect(p).resolves.toBeUndefined();

			expect(t.s1Submit).not.toHaveBeenCalled();
			expect(t.s2Submit).not.toHaveBeenCalled();
			expect(t.onSubmit).not.toHaveBeenCalled();
			expect(t.m.snapshot.currentStepId).toBe("s1");
			expect(t.m.history).toEqual(["s1"]);
		});

		it("goNext does not write 'error' onto the reset state (invalid result)", async () => {
			const t = setup();
			await t.m.goTo("s2", { skipValidation: true });
			t.arm();
			const p = t.m.goNext();
			await Promise.resolve();
			t.m.reset();
			t.gate.resolve({ valid: false, errors: { name: "bad" } });
			await expect(p).resolves.toBeUndefined();

			expect(t.onError).not.toHaveBeenCalled();
			expect(t.m.snapshot.stepStatuses.s1).toBe("active");
		});

		it("goTo does not report a superseded validation failure", async () => {
			const t = setup();
			await t.m.goTo("s2", { skipValidation: true });
			t.arm();
			const p = t.m.goTo("s3");
			await Promise.resolve();
			t.m.reset();
			t.gate.resolve({ valid: false, errors: { name: "bad" } });
			await expect(p).resolves.toBeUndefined();

			expect(t.onError).not.toHaveBeenCalled();
			expect(t.m.snapshot.currentStepId).toBe("s1");
			expect(t.m.snapshot.stepStatuses.s1).toBe("active");
		});

		it("goTo does not act on a superseded enabled-guard result", async () => {
			const guard = deferred<boolean>();
			const onError = vi.fn();
			const m = new WizardMachine<D>(
				staleDefinition(
					{ guard: guard.promise },
					{ s1Submit: vi.fn(), s2Submit: vi.fn() },
				),
				{},
				{ name: "" },
				{ onError },
			);
			const p = m.goTo("s3", { skipValidation: true });
			await Promise.resolve();
			m.reset();
			guard.resolve(false);
			await expect(p).resolves.toBeUndefined();
			expect(onError).not.toHaveBeenCalled();
			expect(m.snapshot.currentStepId).toBe("s1");
		});

		it("submit does not run the old step's onSubmit with reset data", async () => {
			const t = setup();
			await t.m.goTo("s2", { skipValidation: true });
			t.arm();
			const p = t.m.submit();
			await Promise.resolve();
			t.m.reset();
			t.gate.resolve({ valid: true });
			await expect(p).resolves.toBeUndefined();

			expect(t.s2Submit).not.toHaveBeenCalled();
			expect(t.onSubmit).not.toHaveBeenCalled();
			expect(t.m.snapshot.isCompleted).toBe(false);
		});
	});

	// ── #2 complete() ordering ─────────────────────────────────────────
	describe("#2 complete() commits isCompleted only after onComplete resolves", () => {
		const single = (onComplete: WizardDefinition<D>["onComplete"]) =>
			({
				id: "single",
				initialStepId: "a",
				steps: { a: { id: "a" } },
				onComplete,
			}) satisfies WizardDefinition<D>;

		it("a throwing onComplete leaves isCompleted false and a retry succeeds", async () => {
			const boom = new Error("server down");
			const onCompleteDef = vi
				.fn()
				.mockRejectedValueOnce(boom)
				.mockResolvedValueOnce(undefined);
			const onComplete = vi.fn();
			const onStateChange = vi.fn();
			const m = new WizardMachine<D>(
				single(onCompleteDef),
				{},
				{ name: "" },
				{ onComplete, onStateChange, onError: vi.fn() },
			);

			await expect(m.submit()).rejects.toBe(boom);
			expect(m.snapshot.isCompleted).toBe(false);
			expect(onComplete).not.toHaveBeenCalled();

			await expect(m.submit()).resolves.toBeUndefined();
			expect(m.snapshot.isCompleted).toBe(true);
			expect(onComplete).toHaveBeenCalledTimes(1);
			const last = onStateChange.mock.calls.at(-1)?.[0] as WizardState<D>;
			expect(last.isCompleted).toBe(true);
		});

		it("definition.onComplete observes isCompleted === false", async () => {
			let seen: boolean | undefined;
			const m: WizardMachine<D> = new WizardMachine<D>(
				single(() => {
					seen = m.snapshot.isCompleted;
				}),
				{},
				{ name: "" },
			);
			await m.goNext();
			expect(seen).toBe(false);
			expect(m.snapshot.isCompleted).toBe(true);
		});

		it("reset() during onComplete suppresses the completion events", async () => {
			const gate = deferred();
			const onComplete = vi.fn();
			const pluginComplete = vi.fn();
			const m = new WizardMachine<D>(
				single(() => gate.promise),
				{},
				{ name: "" },
				{ onComplete },
				[{ name: "p", onComplete: pluginComplete }],
			);
			const p = m.submit();
			await flush();
			m.reset();
			gate.resolve();
			await expect(p).resolves.toBeUndefined();
			await flush();

			expect(onComplete).not.toHaveBeenCalled();
			expect(pluginComplete).not.toHaveBeenCalled();
			expect(m.snapshot.isCompleted).toBe(false);
		});
	});

	// ── #3 goPrevious honours enabled guards on history entries ────────
	describe("#3 goPrevious / getPreviousStepId skip disabled history entries", () => {
		const guarded = (): WizardDefinition<D> => ({
			id: "guarded",
			initialStepId: "s1",
			steps: {
				s1: {
					id: "s1",
					enabled: (d) => d.s1On !== false,
					next: { type: "static", to: "s2" },
				},
				s2: {
					id: "s2",
					enabled: (d) => d.flag === true,
					next: { type: "static", to: "s3" },
					previous: { type: "static", to: "s1" },
				},
				s3: { id: "s3", previous: { type: "static", to: "s2" } },
			},
		});

		it("skips a disabled history entry and pops past it", async () => {
			const m = new WizardMachine<D>(guarded(), {}, { name: "", flag: true });
			await m.goNext();
			await m.goNext();
			expect(m.history).toEqual(["s1", "s2", "s3"]);

			m.updateField("flag", false);
			await expect(m.getPreviousStepId()).resolves.toBe("s1");

			await m.goPrevious();
			expect(m.snapshot.currentStepId).toBe("s1");
			expect(m.history).toEqual(["s1"]);
		});

		it("throws (reason 'disabled') and reports null when no earlier entry is enabled", async () => {
			const m = new WizardMachine<D>(
				guarded(),
				{},
				{ name: "", flag: true },
				{ onError: vi.fn() },
			);
			await m.goNext();
			await m.goNext();
			m.setData({ name: "", flag: false, s1On: false });

			await expect(m.getPreviousStepId()).resolves.toBeNull();
			const err = await m.goPrevious().catch((e: unknown) => e);
			expect(err).toBeInstanceOf(WizardNavigationError);
			expect((err as WizardNavigationError).reason).toBe("disabled");
			expect(m.snapshot.currentStepId).toBe("s3");
			expect(m.history).toEqual(["s1", "s2", "s3"]);
		});

		it("falls back to the previous resolver only for single-entry history", async () => {
			const m = new WizardMachine<D>(guarded(), {}, { name: "", flag: true });
			await m.goTo("s3", { skipValidation: true });
			m.clearHistory();
			await expect(m.getPreviousStepId()).resolves.toBe("s2");
		});
	});

	// ── #4 restore() supersedes in-flight work ─────────────────────────
	describe("#4 restore() bumps the abort generation", () => {
		it("an in-flight goNext does not commit over the restored state", async () => {
			const leave = deferred();
			const onStepEnter = vi.fn();
			const def: WizardDefinition<D> = {
				id: "restore-race",
				initialStepId: "s1",
				steps: {
					s1: {
						id: "s1",
						onLeave: () => leave.promise,
						next: { type: "static", to: "s2" },
					},
					s2: { id: "s2" },
				},
			};
			const m = new WizardMachine<D>(def, {}, { name: "" }, { onStepEnter });
			await flush();
			onStepEnter.mockClear();
			const atS1 = m.serialize();

			const p = m.goNext();
			await flush();
			m.restore(atS1);
			leave.resolve();
			await p;

			expect(m.snapshot.currentStepId).toBe("s1");
			expect(m.history).toEqual(["s1"]);
			expect(onStepEnter).not.toHaveBeenCalledWith("s2", expect.anything());
		});

		it("a sync persistence restore suppresses the constructor's pending initial onStepEnter", async () => {
			const enter = deferred();
			const onStepEnter = vi.fn();
			const onStateChange = vi.fn();
			const def = createSimpleLinearDefinition();
			def.steps.step1 = { ...def.steps.step1, onEnter: () => enter.promise };
			const record: PersistedWizardSnapshot<SimpleData> = {
				envelope: 1,
				version: 1,
				savedAt: Date.now(),
				state: {
					version: 1,
					currentStepId: "step2",
					data: { name: "r", email: "r@x.io" },
					isValid: true,
					isCompleted: false,
					stepStatuses: { step1: "completed", step2: "active" },
					visitedSteps: ["step1", "step2"],
					history: ["step1", "step2"],
				},
			};
			const m = new WizardMachine<SimpleData>(
				def,
				{},
				{ name: "", email: "" },
				{ onStepEnter, onStateChange },
				[
					createPersistencePlugin<SimpleData>({
						adapter: { load: () => record, save: () => {}, clear: () => {} },
					}),
				],
			);
			expect(m.snapshot.currentStepId).toBe("step2");

			enter.resolve();
			await flush();
			expect(onStepEnter).not.toHaveBeenCalledWith("step1", expect.anything());
			const last = onStateChange.mock.calls.at(
				-1,
			)?.[0] as WizardState<SimpleData>;
			expect(last.currentStepId).toBe("step2");
		});
	});

	// ── #5 in-place updateData ─────────────────────────────────────────
	describe("#5 updateData commits a new reference for an in-place updater", () => {
		it("the committed data reference changes and the diff is reported", () => {
			const onStateChange = vi.fn();
			const onDataChange = vi.fn();
			const m = new WizardMachine<D>(
				createSimpleLinearDefinition() as unknown as WizardDefinition<D>,
				{},
				{ name: "a" },
				{ onStateChange, onDataChange },
			);
			const before = m.snapshot.data;

			m.updateData((d) => {
				d.name = "b";
				return d;
			});

			const after = m.snapshot.data;
			expect(after).not.toBe(before);
			expect(after.name).toBe("b");
			const emitted = onStateChange.mock.calls.at(-1)?.[0] as WizardState<D>;
			expect(emitted.data).toBe(after);
			expect(onDataChange).toHaveBeenCalledTimes(1);
			expect(onDataChange.mock.calls[0][1]).toBe(after);
			expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
		});
	});

	// ── #6 "error" status lifecycle ────────────────────────────────────
	describe("#6 'error' status is set by goTo/submit and cleared by a passing validate", () => {
		const make = () => {
			const onStateChange = vi.fn();
			const m = new WizardMachine<SimpleData>(
				createValidatedDefinition(),
				{},
				{ name: "", email: "" },
				{ onStateChange, onError: vi.fn() },
			);
			return { m, onStateChange };
		};

		it("goTo marks the current step 'error' on a validation failure", async () => {
			const { m, onStateChange } = make();
			await expect(m.goTo("step2")).rejects.toThrow(WizardValidationError);
			expect(m.snapshot.stepStatuses.step1).toBe("error");
			const last = onStateChange.mock.calls.at(
				-1,
			)?.[0] as WizardState<SimpleData>;
			expect(last.stepStatuses.step1).toBe("error");
		});

		it("submit marks the current step 'error' on a validation failure", async () => {
			const { m, onStateChange } = make();
			await expect(m.submit()).rejects.toThrow(WizardValidationError);
			expect(m.snapshot.stepStatuses.step1).toBe("error");
			const last = onStateChange.mock.calls.at(
				-1,
			)?.[0] as WizardState<SimpleData>;
			expect(last.stepStatuses.step1).toBe("error");
		});

		it("a passing validate() clears 'error' with exactly one onStateChange", async () => {
			const { m, onStateChange } = make();
			await expect(m.goNext()).rejects.toThrow(WizardValidationError);
			expect(m.snapshot.stepStatuses.step1).toBe("error");

			m.updateField("name", "Ada");
			onStateChange.mockClear();
			await m.validate();

			expect(onStateChange).toHaveBeenCalledTimes(1);
			const emitted = onStateChange.mock.calls[0][0] as WizardState<SimpleData>;
			expect(emitted.stepStatuses.step1).toBe("active");
			expect(emitted.isValid).toBe(true);
		});
	});

	// ── #7 departure keeps "completed" ─────────────────────────────────
	describe("#7 back/goTo departures keep a 'completed' status", () => {
		it("two Back clicks do not regress progress", async () => {
			const m = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				{ name: "", email: "" },
			);
			await m.goNext();
			await m.goNext();
			expect(m.snapshot.progress.percentage).toBe(67);

			await m.goPrevious(); // leave step3 (active -> visited)
			await m.goPrevious(); // leave step2 (completed -> stays completed)

			expect(m.snapshot.stepStatuses).toEqual({
				step1: "completed",
				step2: "completed",
				step3: "visited",
			});
			expect(m.snapshot.progress.percentage).toBe(67);
		});

		it("goTo away from a completed step keeps it completed", async () => {
			const m = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				{ name: "", email: "" },
			);
			await m.goNext(); // step1 completed
			await m.goTo("step1"); // back to completed step1
			await m.goTo("step3"); // leave completed step1
			expect(m.snapshot.stepStatuses.step1).toBe("completed");
			expect(m.snapshot.stepStatuses.step2).toBe("visited");
		});
	});

	// ── #8 persistence `ready` re-arms per onInit (integration) ────────
	describe("#8 persistence ready reflects the latest machine", () => {
		it("reports the second machine's restore after the first was destroyed", async () => {
			const loads: ReturnType<
				typeof deferred<PersistedWizardSnapshot<SimpleData> | null>
			>[] = [];
			const adapter = {
				load: () => {
					const d = deferred<PersistedWizardSnapshot<SimpleData> | null>();
					loads.push(d);
					return d.promise;
				},
				save: vi.fn(),
				clear: vi.fn(),
			};
			const plugin = createPersistencePlugin<SimpleData>({ adapter });
			const record: PersistedWizardSnapshot<SimpleData> = {
				envelope: 1,
				version: 1,
				savedAt: Date.now(),
				state: {
					version: 1,
					currentStepId: "step2",
					data: { name: "r", email: "r@x.io" },
					isValid: true,
					isCompleted: false,
					stepStatuses: { step1: "completed", step2: "active" },
					visitedSteps: ["step1", "step2"],
					history: ["step1", "step2"],
				},
			};

			const m1 = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				{ name: "", email: "" },
				{},
				[plugin],
			);
			await m1.destroy();

			const m2 = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				{ name: "", email: "" },
				{},
				[plugin],
			);
			const ready = plugin.ready; // read AFTER machine2 creation

			loads[0].resolve(record); // machine1's late load: superseded
			loads[1].resolve(record);

			await expect(ready).resolves.toMatchObject({ status: "restored" });
			expect(m2.snapshot.currentStepId).toBe("step2");
			expect(m1.snapshot.currentStepId).toBe("step1");
		});
	});
});

// ── #9 plugin host dispatch uses a snapshot + liveness check ───────────
describe("review fixes — PluginHost async dispatch", () => {
	const ev: TransitionEvent<D> = {
		type: "next",
		fromStepId: "a",
		toStepId: "b",
		data: { name: "" },
		timestamp: 0,
	};

	it("removing the running plugin mid-dispatch does not skip the next one", async () => {
		const host = new PluginHost<D>(() => {});
		const b = vi.fn();
		const c = vi.fn();
		const a: WizardPlugin<D> = {
			name: "A",
			afterTransition: async () => {
				void host.remove("A");
				await Promise.resolve();
			},
		};
		host.add(a);
		host.add({ name: "B", afterTransition: b });
		host.add({ name: "C", afterTransition: c });

		await host.dispatchAfterTransition(ev);

		expect(b).toHaveBeenCalledTimes(1);
		expect(c).toHaveBeenCalledTimes(1);
	});

	it("does not invoke a plugin removed while an earlier hook was awaited", async () => {
		const host = new PluginHost<D>(() => {});
		const c = vi.fn();
		host.add({
			name: "A",
			onReset: async () => {
				await host.remove("C");
			},
		});
		host.add({ name: "B" });
		host.add({ name: "C", onReset: c });

		await host.dispatchReset();
		expect(c).not.toHaveBeenCalled();
	});

	// dispatchComplete is intentionally synchronous fan-out (see
	// integration-bugfixes.test.ts), so the mid-dispatch isLive check is
	// exercised through the still-sequential dispatchReset.
	it("destroyAll() mid-dispatch stops hooks on already-destroyed plugins", async () => {
		const host = new PluginHost<D>(() => {});
		const gate = deferred();
		const bHook = vi.fn();
		const bDestroy = vi.fn();
		host.add({
			name: "A",
			onReset: () => gate.promise,
		});
		host.add({ name: "B", onReset: bHook, destroy: bDestroy });

		const p = host.dispatchReset();
		await Promise.resolve();
		await host.destroyAll();
		expect(bDestroy).toHaveBeenCalledTimes(1);
		gate.resolve();
		await p;

		expect(bHook).not.toHaveBeenCalled();
	});
});
