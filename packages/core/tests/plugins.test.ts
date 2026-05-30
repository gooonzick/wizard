import { describe, expectTypeOf, test } from "vitest";
import type { WizardError } from "../src/errors";
import type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "../src/plugins/types";
import type { StepStatus } from "../src/types/step";

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
