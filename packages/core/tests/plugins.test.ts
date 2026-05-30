import { describe, expect, expectTypeOf, it, test, vi } from "vitest";
import type { WizardError } from "../src/errors";
import { WizardConfigurationError } from "../src/errors";
import { WizardMachine } from "../src/machine/wizard-machine";
import type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "../src/plugins/types";
import type { StepStatus } from "../src/types/step";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

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
});
