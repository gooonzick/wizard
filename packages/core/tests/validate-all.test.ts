import { describe, expect, it, vi } from "vitest";
import {
	type WizardEvents,
	WizardMachine,
} from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import type { WizardDefinition } from "../src/types/definition";
import {
	createConditionalDefinition,
	createValidatedDefinition,
	type FormData,
	type SimpleData,
} from "./fixtures";

const defaultContext = {};

function createValidatedMachine(
	overrides: Partial<SimpleData> = {},
	events?: WizardEvents<SimpleData>,
): WizardMachine<SimpleData> {
	const initialData: SimpleData = {
		name: "Ada",
		email: "ada@example.com",
		...overrides,
	};
	return new WizardMachine(
		createValidatedDefinition(),
		defaultContext,
		initialData,
		events,
	);
}

function createConditionalMachine(
	overrides: Partial<FormData> = {},
	events?: WizardEvents<FormData>,
): WizardMachine<FormData> {
	const initialData: FormData = {
		name: "Ada",
		email: "ada@example.com",
		age: 30,
		enabled: false,
		...overrides,
	};
	return new WizardMachine(
		createConditionalDefinition(),
		defaultContext,
		initialData,
		events,
	);
}

describe("WizardMachine.validateAll", () => {
	it("reports all steps valid with no invalid ids (case 1)", async () => {
		const machine = createValidatedMachine();

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(true);
		expect(summary.invalidStepIds).toEqual([]);
		expect(summary.firstInvalidStepId).toBeNull();
		// step1, step2, step3 all enabled.
		expect(summary.steps.map((s) => s.stepId)).toEqual([
			"step1",
			"step2",
			"step3",
		]);
	});

	it("flags a single invalid step (case 2)", async () => {
		const machine = createValidatedMachine({ name: "" });

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(false);
		expect(summary.firstInvalidStepId).toBe("step1");
		expect(summary.invalidStepIds).toEqual(["step1"]);
		const step1 = summary.steps.find((s) => s.stepId === "step1");
		expect(step1?.errors).toEqual({ name: "Name is required" });
	});

	it("lists multiple invalid steps in definition order (case 3)", async () => {
		const machine = createValidatedMachine({ name: "", email: "" });

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["step1", "step2"]);
		expect(summary.firstInvalidStepId).toBe("step1");
	});

	it("skips a disabled step (case 4)", async () => {
		// `optional` has enabled guard (d) => d.enabled; enabled:false skips it.
		const machine = createConditionalMachine({ enabled: false });

		const summary = await machine.validateAll();

		const stepIds = summary.steps.map((s) => s.stepId);
		expect(stepIds).not.toContain("optional");
		expect(stepIds).toEqual(["personal", "preferences", "summary"]);
	});

	it("treats a step without validate as valid and includes it (case 5)", async () => {
		const machine = createValidatedMachine();

		const summary = await machine.validateAll();

		const step3 = summary.steps.find((s) => s.stepId === "step3");
		expect(step3).toBeDefined();
		expect(step3?.valid).toBe(true);
		expect(step3?.errors).toBeUndefined();
	});

	it("awaits async validators (case 6)", async () => {
		// createValidatedDefinition uses async validators; assert the resolved
		// values are reflected (not left as pending promises).
		const machine = createValidatedMachine({ name: "Grace", email: "" });

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["step2"]);
		const step1 = summary.steps.find((s) => s.stepId === "step1");
		expect(step1?.valid).toBe(true);
	});

	it("updateStatuses:true marks invalid steps error and emits once (case 7)", async () => {
		const onStateChange = vi.fn();
		const machine = createValidatedMachine(
			{ name: "", email: "" },
			{ onStateChange },
		);
		// Ignore the initial construction emit; count only validateAll's.
		onStateChange.mockClear();

		const summary = await machine.validateAll({ updateStatuses: true });

		expect(summary.valid).toBe(false);
		expect(machine.getStepStatus("step1")).toBe("error");
		expect(machine.getStepStatus("step2")).toBe("error");
		expect(onStateChange).toHaveBeenCalledTimes(1);
	});

	it("default (dry-run) does not mutate stepStatuses or emit (case 8)", async () => {
		const onStateChange = vi.fn();
		const machine = createValidatedMachine(
			{ name: "", email: "" },
			{ onStateChange },
		);
		const step1StatusBefore = machine.getStepStatus("step1");
		// Ignore the initial construction emit; validateAll must not emit.
		onStateChange.mockClear();

		await machine.validateAll();

		expect(machine.getStepStatus("step1")).toBe(step1StatusBefore);
		expect(onStateChange).not.toHaveBeenCalled();
	});

	it("dry-run does not alter live isValid / validationErrors (case 9)", async () => {
		const machine = createValidatedMachine({ name: "", email: "" });
		const isValidBefore = machine.snapshot.isValid;
		const errorsBefore = machine.snapshot.validationErrors;

		await machine.validateAll();

		expect(machine.snapshot.isValid).toBe(isValidBefore);
		expect(machine.snapshot.validationErrors).toEqual(errorsBefore);
	});

	it("catches a thrown validator without plugin/event onError (case 10)", async () => {
		const onError = vi.fn();
		const pluginOnError = vi.fn();
		const plugin: WizardPlugin<Record<string, unknown>> = {
			name: "spy",
			onError: pluginOnError,
		};
		const definition: WizardDefinition<Record<string, unknown>> = {
			id: "throwing",
			initialStepId: "boom",
			steps: {
				boom: {
					id: "boom",
					validate: () => {
						throw new Error("kaboom");
					},
				},
			},
		};
		const machine = new WizardMachine(
			definition,
			defaultContext,
			{},
			{ onError },
			[plugin],
		);

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["boom"]);
		const boom = summary.steps.find((s) => s.stepId === "boom");
		expect(boom?.errors).toEqual({ _error: "kaboom" });
		expect(onError).not.toHaveBeenCalled();
		expect(pluginOnError).not.toHaveBeenCalled();
	});

	it("returns an empty summary when all steps are disabled (case 11)", async () => {
		const definition: WizardDefinition<Record<string, unknown>> = {
			id: "all-disabled",
			initialStepId: "a",
			steps: {
				a: { id: "a", enabled: false },
				b: { id: "b", enabled: false },
			},
		};
		const machine = new WizardMachine(definition, defaultContext, {});

		const summary = await machine.validateAll();

		expect(summary.steps).toEqual([]);
		expect(summary.valid).toBe(true);
		expect(summary.firstInvalidStepId).toBeNull();
		expect(summary.invalidStepIds).toEqual([]);
	});

	it("updateStatuses:true with all valid does not emit or set error (case 12)", async () => {
		const onStateChange = vi.fn();
		const machine = createValidatedMachine({}, { onStateChange });
		// Ignore the initial construction emit; validateAll must not emit.
		onStateChange.mockClear();

		const summary = await machine.validateAll({ updateStatuses: true });

		expect(summary.valid).toBe(true);
		expect(onStateChange).not.toHaveBeenCalled();
		expect(machine.getStepStatus("step1")).not.toBe("error");
	});

	it("respects a function-guard enabled step when data flips (case 13)", async () => {
		const machine = createConditionalMachine({ enabled: true });

		const summary = await machine.validateAll();

		const stepIds = summary.steps.map((s) => s.stepId);
		expect(stepIds).toContain("optional");
	});

	it("runs after the wizard is completed (case 14)", async () => {
		const definition: WizardDefinition<Record<string, unknown>> = {
			id: "single",
			initialStepId: "only",
			steps: {
				only: { id: "only" },
			},
		};
		const machine = new WizardMachine(definition, defaultContext, {});
		await machine.submit();
		expect(machine.snapshot.isCompleted).toBe(true);

		const summary = await machine.validateAll();

		expect(summary.valid).toBe(true);
		expect(summary.steps.map((s) => s.stepId)).toEqual(["only"]);
	});
});
