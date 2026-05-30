import { describe, expect, expectTypeOf, it, test, vi } from "vitest";
import type { WizardError } from "../src/errors";
import { WizardConfigurationError, WizardValidationError } from "../src/errors";
import { WizardMachine } from "../src/machine/wizard-machine";
import type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "../src/plugins/types";
import type { StepStatus } from "../src/types/step";
import {
	createSimpleLinearDefinition,
	createValidatedDefinition,
	type SimpleData,
} from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

interface Data {
	name: string;
	nested: { count: number; tags: string[] };
}

describe("plugin types", () => {
	test("DeepReadonly makes nested properties readonly", () => {
		expectTypeOf<DeepReadonly<Data>>().toEqualTypeOf<{
			readonly name: string;
			readonly nested: {
				readonly count: number;
				readonly tags: readonly string[];
			};
		}>();
	});

	test("TransitionEvent carries a readonly data payload and a typed `type`", () => {
		expectTypeOf<TransitionEvent<Data>["type"]>().toEqualTypeOf<
			"next" | "previous" | "goTo"
		>();
		expectTypeOf<TransitionEvent<Data>["data"]>().toEqualTypeOf<
			DeepReadonly<Data>
		>();
		expectTypeOf<TransitionEvent<Data>["fromStepId"]>().toEqualTypeOf<string>();
		expectTypeOf<TransitionEvent<Data>["timestamp"]>().toEqualTypeOf<number>();
	});

	test("ErrorContext phase is a fixed union", () => {
		expectTypeOf<ErrorContext<Data>["phase"]>().toEqualTypeOf<
			"validation" | "transition" | "lifecycle" | "submit"
		>();
	});

	test("WizardMachineReadonly exposes read-only views", () => {
		expectTypeOf<WizardMachineReadonly<Data>>().toHaveProperty("snapshot");
		expectTypeOf<WizardMachineReadonly<Data>>().toHaveProperty("currentStep");
		expectTypeOf<WizardMachineReadonly<Data>["getStepStatus"]>().toEqualTypeOf<
			(stepId: string) => StepStatus
		>();
	});

	test("WizardPlugin has a required name and optional hooks", () => {
		expectTypeOf<WizardPlugin<Data>["name"]>().toEqualTypeOf<string>();
		const p: WizardPlugin<Data> = { name: "x" };
		expectTypeOf(p.onError).parameter(0).toEqualTypeOf<WizardError | Error>();
		// beforeTransition may veto with `false`
		const veto: WizardPlugin<Data>["beforeTransition"] = () => false;
		expectTypeOf(veto).not.toBeUndefined();
	});

	test("WizardPlugin does NOT include onDataChange (deferred to WIZ-010)", () => {
		// @ts-expect-error onDataChange is intentionally not part of the interface
		const _p: WizardPlugin<Data> = { name: "x", onDataChange: () => {} };
		void _p;
	});
});

describe("WizardMachine plugin registration", () => {
	it("fires onInit on construction with a read-only machine view", async () => {
		const onInit = vi.fn();
		new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", onInit }],
		);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
		const view = onInit.mock.calls[0][0];
		expect(view.snapshot.currentStepId).toBe("step1");
		expect(view.currentStep.id).toBe("step1");
		expect(view.getStepStatus("step1")).toBe("active");
	});

	it("use() is chainable and fires onInit immediately (fire-and-forget)", async () => {
		const onInit = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		const result = m.use({ name: "late", onInit });
		expect(result).toBe(m);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("use() throws WizardConfigurationError on duplicate name", () => {
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		m.use({ name: "dup" });
		expect(() => m.use({ name: "dup" })).toThrow(WizardConfigurationError);
	});

	it("removePlugin calls destroy and drops the plugin", async () => {
		const destroy = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", destroy }],
		);
		await m.removePlugin("p");
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("destroy() runs all plugins in reverse registration order", async () => {
		const order: string[] = [];
		const mk = (name: string): WizardPlugin<SimpleData> => ({
			name,
			destroy: () => void order.push(name),
		});
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[mk("a"), mk("b"), mk("c")],
		);
		await m.destroy();
		expect(order).toEqual(["c", "b", "a"]);
	});

	it("use() throws WizardConfigurationError after destroy()", async () => {
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		await m.destroy();
		expect(() => m.use({ name: "late" })).toThrow(WizardConfigurationError);
	});
});

describe("WizardMachine before/afterTransition", () => {
	it("beforeTransition fires before the step change with from/to/type for goNext", async () => {
		const before = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before }],
		);
		await m.goNext();
		expect(before).toHaveBeenCalledTimes(1);
		expect(before.mock.calls[0][0]).toMatchObject({
			type: "next",
			fromStepId: "step1",
			toStepId: "step2",
		});
	});

	it("uses type 'previous' for goPrevious and 'goTo' for goTo", async () => {
		const events: { type: string; from: string; to: string }[] = [];
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: (e) =>
						void events.push({
							type: e.type,
							from: e.fromStepId,
							to: e.toStepId,
						}),
				},
			],
		);
		await m.goNext(); // step1 -> step2 (next)
		await m.goTo("step1", { skipValidation: true }); // step2 -> step1 (goTo)
		await m.goNext(); // step1 -> step2 (next)
		await m.goPrevious(); // step2 -> step1 (previous)
		expect(events.map((e) => e.type)).toEqual([
			"next",
			"goTo",
			"next",
			"previous",
		]);
	});

	it("beforeTransition returning false silently cancels (no state change, no afterTransition)", async () => {
		const after = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: () => false, afterTransition: after }],
		);
		const result = await m.goTo("step2", { skipValidation: true });
		expect(result).toBeUndefined(); // goTo stays Promise<void>
		expect(m.snapshot.currentStepId).toBe("step1"); // unchanged
		expect(after).not.toHaveBeenCalled();
	});

	it("beforeTransition throwing aborts the transition, routes to onError + plugin onError (phase 'transition'), and rethrows", async () => {
		const onError = vi.fn();
		const pluginOnError = vi.fn();
		const boom = new Error("veto-throw");
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{ onError },
			[
				{
					name: "p",
					beforeTransition: () => {
						throw boom;
					},
					onError: pluginOnError,
				},
			],
		);
		await expect(m.goNext()).rejects.toBe(boom);
		expect(m.snapshot.currentStepId).toBe("step1");
		// events.onError reporter fires once (unchanged Task 4 behavior).
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBe(boom);
		// Task 5: plugin onError fires EXACTLY once, via withTransition's catch,
		// with the default phase "transition" (the beforeTransition-throw path
		// does not self-report; withTransition is its single reporter).
		expect(pluginOnError).toHaveBeenCalledTimes(1);
		expect(pluginOnError.mock.calls[0][0]).toBe(boom);
		expect(pluginOnError.mock.calls[0][1]).toMatchObject({
			phase: "transition",
			stepId: "step1",
		});
	});

	it("afterTransition fires after the committed state change", async () => {
		let observed: string | undefined;
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					afterTransition: () => {
						observed = m.snapshot.currentStepId;
					},
				},
			],
		);
		await m.goNext();
		expect(observed).toBe("step2");
	});

	it("before/afterTransition still fire under skipLifecycle", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before, afterTransition: after }],
		);
		await m.goTo("step2", { skipValidation: true, skipLifecycle: true });
		expect(before).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("a throw in afterTransition is isolated; other plugins still run, navigation succeeds", async () => {
		const second = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "a",
					afterTransition: () => {
						throw new Error("after-fail");
					},
				},
				{ name: "b", afterTransition: second },
			],
		);
		await m.goNext();
		expect(m.snapshot.currentStepId).toBe("step2");
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("does not corrupt state when beforeTransition awaits while reset() runs (staleness)", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: async () => {
						await gate;
					},
				},
			],
		);
		const nav = m.goNext();
		m.reset(); // supersede the in-flight transition
		release();
		await nav;
		expect(m.snapshot.currentStepId).toBe("step1"); // reset wins, no corruption
	});

	it("re-entrancy: a plugin calling goNext inside a hook throws busy", async () => {
		let captured: unknown;
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: async () => {
						try {
							await m.goNext();
						} catch (e) {
							captured = e;
						}
					},
				},
			],
		);
		await m.goNext();
		expect((captured as { reason?: string })?.reason).toBe("busy");
	});
});

describe("WizardMachine plugin onError", () => {
	it("dispatches onError on a validation error with phase 'validation'", async () => {
		const onError = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" }, // invalid: name required on step1
			{},
			[{ name: "p", onError }],
		);
		await expect(m.goNext()).rejects.toBeTruthy();
		// Exactly once — the goNext throw site reports with phase "validation";
		// withTransition's catch skips the WizardValidationError.
		expect(onError).toHaveBeenCalledTimes(1);
		const [err, ctx] = onError.mock.calls.at(-1) ?? [];
		expect(ctx).toMatchObject({ phase: "validation", stepId: "step1" });
		expect(ctx.data).toBeDefined();
		expect(err).toBeInstanceOf(WizardValidationError);
	});

	it("dispatches onError with phase 'validation' when goTo fails current-step validation", async () => {
		const onError = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" }, // invalid: current step1 fails validation
			{},
			[{ name: "p", onError }],
		);
		// goTo validates the CURRENT step before leaving; skipValidation defaults to false.
		await expect(m.goTo("step2")).rejects.toBeTruthy();
		expect(onError).toHaveBeenCalledTimes(1);
		const ctx = onError.mock.calls.at(-1)?.[1];
		expect(ctx).toMatchObject({ phase: "validation", stepId: "step1" });
	});

	it("a throw inside a plugin's onError is swallowed (no recursion)", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" },
			{},
			[
				{
					name: "p",
					onError: () => {
						throw new Error("inside-onError");
					},
				},
			],
		);
		await expect(m.goNext()).rejects.toBeTruthy();
		// No infinite loop: console.error called a bounded number of times.
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
