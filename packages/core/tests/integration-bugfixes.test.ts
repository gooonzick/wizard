import { describe, expect, it, vi } from "vitest";
import { createStep } from "../src/builders/create-step";
import { WizardMachine, type WizardState } from "../src/machine/wizard-machine";
import { createAnalyticsPlugin } from "../src/plugins/analytics";
import { PluginHost } from "../src/plugins/plugin-host";
import type {
	ErrorContext,
	WizardMachineReadonly,
	WizardPlugin,
} from "../src/plugins/types";
import type { WizardDefinition } from "../src/types/definition";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

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

// ── BUG 1: function `enabled` guards → "skipped" at navigation time ─────────

interface AccountData extends Record<string, unknown> {
	accountType: "personal" | "business";
	company?: string;
}

/** account → (business ? company : review) → review. */
function accountDefinition(): WizardDefinition<AccountData> {
	return {
		id: "account",
		initialStepId: "account",
		steps: {
			account: {
				id: "account",
				next: {
					type: "conditional",
					branches: [
						{ when: (d) => d.accountType === "business", to: "company" },
						{ when: () => true, to: "review" },
					],
				},
			},
			company: {
				id: "company",
				enabled: (d) => d.accountType === "business",
				next: { type: "static", to: "review" },
				previous: { type: "static", to: "account" },
			},
			review: {
				id: "review",
				previous: { type: "static", to: "account" },
			},
		},
	};
}

describe("BUG 1 — function enabled guards produce 'skipped'", () => {
	it("personal path: company is skipped, excluded from enabledSteps, and completion reaches 100%", async () => {
		const m = new WizardMachine<AccountData>(
			accountDefinition(),
			{},
			{ accountType: "personal" },
		);
		await flush(); // initial-step guard refresh

		expect(m.snapshot.stepStatuses.company).toBe("skipped");

		await m.goNext();
		const atReview = m.snapshot;
		expect(atReview.currentStepId).toBe("review");
		expect(atReview.stepStatuses.company).toBe("skipped");
		expect(atReview.progress.enabledStepIds).toEqual(["account", "review"]);
		expect(atReview.progress.enabledSteps).toBe(2);
		expect(atReview.progress.percentage).toBe(50);

		await m.goNext(); // review has no next → complete()
		const done = m.snapshot;
		expect(done.isCompleted).toBe(true);
		expect(done.stepStatuses.review).toBe("completed");
		expect(done.progress.completedSteps).toBe(2);
		expect(done.progress.percentage).toBe(100);
	});

	it("the navigation's single committed snapshot already carries the refreshed statuses", async () => {
		const snapshots: WizardState<AccountData>[] = [];
		const m = new WizardMachine<AccountData>(
			accountDefinition(),
			{},
			{ accountType: "business" },
			{ onStateChange: (s) => snapshots.push(s) },
		);
		await flush();
		expect(m.snapshot.stepStatuses.company).toBe("pristine");

		m.updateField("accountType", "personal");
		snapshots.length = 0;
		await m.goNext();

		const atReview = snapshots.filter((s) => s.currentStepId === "review");
		expect(atReview).toHaveLength(1);
		expect(atReview[0].stepStatuses.company).toBe("skipped");
	});

	it("switching back to business and navigating un-skips company", async () => {
		const m = new WizardMachine<AccountData>(
			accountDefinition(),
			{},
			{ accountType: "personal" },
		);
		await m.goNext(); // → review
		expect(m.snapshot.stepStatuses.company).toBe("skipped");

		// A data change alone does not re-evaluate function guards (M-c) ...
		m.updateField("accountType", "business");
		expect(m.snapshot.stepStatuses.company).toBe("skipped");

		// ... the next navigation does.
		await m.goPrevious(); // → account
		expect(m.snapshot.currentStepId).toBe("account");
		expect(m.snapshot.stepStatuses.company).toBe("pristine");
		expect(m.snapshot.progress.enabledSteps).toBe(3);

		await m.goNext(); // → company
		expect(m.snapshot.currentStepId).toBe("company");
		expect(m.snapshot.stepStatuses.company).toBe("active");
	});

	it("never marks the current step skipped (goTo with skipGuards into a disabled step)", async () => {
		const m = new WizardMachine<AccountData>(
			accountDefinition(),
			{},
			{ accountType: "personal" },
		);
		await flush();
		expect(m.snapshot.stepStatuses.company).toBe("skipped");

		await m.goTo("company", { skipGuards: true });
		expect(m.snapshot.currentStepId).toBe("company");
		expect(m.snapshot.stepStatuses.company).toBe("active");
		expect(m.snapshot.progress.currentStepIndex).toBe(1);

		// Leaving it re-applies the (still false) guard.
		await m.goTo("review", { skipGuards: true });
		expect(m.snapshot.stepStatuses.company).toBe("skipped");
	});

	it("reset() re-applies function guards for the fresh initial data", async () => {
		const m = new WizardMachine<AccountData>(
			accountDefinition(),
			{},
			{ accountType: "business" },
		);
		await flush();
		expect(m.snapshot.stepStatuses.company).toBe("pristine");

		m.reset({ accountType: "personal" });
		await flush();
		expect(m.snapshot.stepStatuses.company).toBe("skipped");
		expect(m.snapshot.progress.enabledSteps).toBe(2);
	});

	it("a throwing guard during refresh does not fail navigation and is reported once (phase transition)", async () => {
		interface D extends Record<string, unknown> {
			explode: boolean;
		}
		const def: WizardDefinition<D> = {
			id: "throwing",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b" },
				// Side step: never on the sync next-path, so only the refresh runs it.
				side: {
					id: "side",
					enabled: (d) => {
						if (d.explode) {
							throw new Error("guard boom");
						}
						return false;
					},
				},
			},
		};
		const onError = vi.fn();
		const pluginPhases: ErrorContext<D>["phase"][] = [];
		const plugin: WizardPlugin<D> = {
			name: "errors",
			onError: (_err, ctx) => {
				pluginPhases.push(ctx.phase);
			},
		};
		const m = new WizardMachine<D>(def, {}, { explode: false }, { onError }, [
			plugin,
		]);
		await flush();
		expect(m.snapshot.stepStatuses.side).toBe("skipped");
		expect(onError).not.toHaveBeenCalled();

		m.updateField("explode", true);
		await expect(m.goNext()).resolves.toBeUndefined();

		expect(m.snapshot.currentStepId).toBe("b");
		expect(m.snapshot.stepStatuses.side).toBe("skipped"); // unchanged
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
		expect((onError.mock.calls[0][0] as Error).message).toBe("guard boom");
		expect(pluginPhases).toEqual(["transition"]);
	});

	it("a throwing guard reported after afterTransition keeps analytics in sync", async () => {
		interface D extends Record<string, unknown> {
			explode: boolean;
		}
		const def: WizardDefinition<D> = {
			id: "throwing-analytics",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b" },
				side: {
					id: "side",
					enabled: (d) => {
						if (d.explode) {
							throw new Error("guard boom");
						}
						return true;
					},
				},
			},
		};
		const onStepComplete = vi.fn();
		const analytics = createAnalyticsPlugin<D>({ onStepComplete });
		const m = new WizardMachine<D>(
			def,
			{},
			{ explode: true },
			{ onError: vi.fn() },
			[analytics],
		);
		await flush();
		await m.goNext();

		expect(onStepComplete).toHaveBeenCalledWith("a", expect.any(Number));
		expect(analytics.getReport().currentStep).toBe("b");
	});
});

// ── BUG 2: completion ordering & analytics drop-off ─────────────────────────

describe("BUG 2 — completion notifies plugins before events.onComplete", () => {
	const initial: SimpleData = { name: "a", email: "a@x.io" };

	it("destroy() inside events.onComplete: analytics reports completion, never a drop-off", async () => {
		const onWizardComplete = vi.fn();
		const onDropOff = vi.fn();
		const analytics = createAnalyticsPlugin<SimpleData>({
			onWizardComplete,
			onDropOff,
		});
		let machine!: WizardMachine<SimpleData>;
		machine = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{
				onComplete: () => {
					void machine.destroy(); // e.g. app navigates away / unmounts
				},
			},
			[analytics],
		);
		await flush();
		await machine.goNext();
		await machine.goNext();
		await machine.goNext(); // complete
		await flush();

		expect(machine.snapshot.isCompleted).toBe(true);
		expect(onWizardComplete).toHaveBeenCalledTimes(1);
		expect(onDropOff).not.toHaveBeenCalled();
		expect(analytics.getReport().completed).toBe(true);
	});

	it("runs plugin onComplete before events.onComplete, after the committed state change", async () => {
		const log: string[] = [];
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{
				onStateChange: (s) => {
					if (s.isCompleted) log.push("state:completed");
				},
				onComplete: () => log.push("events.onComplete"),
			},
			[
				{ name: "p1", onComplete: () => void log.push("p1") },
				{ name: "p2", onComplete: () => void log.push("p2") },
			],
		);
		await m.goNext();
		await m.goNext();
		await m.goNext();

		expect(log).toEqual(["state:completed", "p1", "p2", "events.onComplete"]);
	});

	it("isolates a throwing and a rejecting plugin onComplete; the others still run", async () => {
		const onError = vi.fn();
		const phases: ErrorContext<SimpleData>["phase"][] = [];
		const last = vi.fn();
		const eventsComplete = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{ onError, onComplete: eventsComplete },
			[
				{
					name: "observer",
					onError: (_e, ctx) => {
						phases.push(ctx.phase);
					},
				},
				{
					name: "sync-throw",
					onComplete: () => {
						throw new Error("sync boom");
					},
				},
				{
					name: "async-reject",
					onComplete: async () => {
						throw new Error("async boom");
					},
				},
				{ name: "last", onComplete: last },
			],
		);
		await m.goNext();
		await m.goNext();
		await expect(m.goNext()).resolves.toBeUndefined();
		await flush();

		expect(last).toHaveBeenCalledTimes(1);
		expect(eventsComplete).toHaveBeenCalledTimes(1);
		const messages = onError.mock.calls.map((c) => (c[0] as Error).message);
		expect(messages).toEqual(
			expect.arrayContaining(["sync boom", "async boom"]),
		);
		expect(onError).toHaveBeenCalledTimes(2);
		expect(phases).toEqual(["lifecycle", "lifecycle"]);
	});

	it("PluginHost.dispatchComplete invokes every plugin synchronously and never rejects", async () => {
		const reported: unknown[] = [];
		const host = new PluginHost<SimpleData>((err) => reported.push(err));
		const gate = deferred();
		const b = vi.fn();
		host.add({ name: "A", onComplete: () => gate.promise });
		host.add({
			name: "R",
			onComplete: () => Promise.reject(new Error("nope")),
		});
		host.add({ name: "B", onComplete: b });

		let settled = false;
		const p = host.dispatchComplete(initial).then(() => {
			settled = true;
		});
		// No await between plugins: B already ran, synchronously.
		expect(b).toHaveBeenCalledTimes(1);

		await flush();
		expect(settled).toBe(false); // still waiting on A's promise
		gate.resolve();
		await p;
		expect(settled).toBe(true);
		expect(reported).toHaveLength(1);
	});

	it("analytics destroy() treats a machine-completed wizard as completed (belt and braces)", () => {
		const onDropOff = vi.fn();
		const analytics = createAnalyticsPlugin<SimpleData>({ onDropOff });
		const view = {
			snapshot: { currentStepId: "step3", data: initial, isCompleted: true },
		} as unknown as WizardMachineReadonly<SimpleData>;
		analytics.onInit?.(view);
		// onComplete never reached the plugin, but the machine is completed.
		analytics.destroy?.();

		expect(onDropOff).not.toHaveBeenCalled();
	});
});

// ── BUG 5: StepBuilder.required accepts RequiredFieldsOptions ───────────────

describe("BUG 5 — StepBuilder.required with options", () => {
	it("uses the custom message passed as a trailing options object", async () => {
		const step = createStep<{ email: string; name: string }>("contact")
			.required("email", "name", {
				messages: { email: "Please enter your email" },
			})
			.build();

		const result = await step.validate?.({ email: "", name: "" }, {});
		expect(result?.valid).toBe(false);
		expect(result?.errors).toEqual({
			email: "Please enter your email",
			name: "name is required",
		});
	});
});
