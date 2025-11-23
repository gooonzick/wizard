import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { WizardData } from "src";
import { describe, expect, test } from "vitest";
import { createStep } from "../src/builders/create-step";
import { createWizard } from "../src/builders/create-wizard";

describe("StepBuilder", () => {
	test("should build step with all properties", () => {
		const step = createStep<{ name: string }>("test-step")
			.title("Test Step")
			.description("A test step")
			.icon("🧪")
			.next("next-step")
			.previous("prev-step")
			.required("name")
			.onEnter(async () => {})
			.onLeave(async () => {})
			.onSubmit(async () => {})
			.build();

		expect(step.id).toBe("test-step");
		expect(step.meta?.title).toBe("Test Step");
		expect(step.meta?.description).toBe("A test step");
		expect(step.meta?.icon).toBe("🧪");
		expect(step.next).toEqual({ type: "static", to: "next-step" });
		expect(step.previous).toEqual({ type: "static", to: "prev-step" });
		expect(step.validate).toBeDefined();
	});

	test("should support conditional next", () => {
		const step = createStep<{ value: number }>("conditional")
			.nextWhen([
				{ when: (d: { value: number }) => d.value > 10, to: "high" },
				{ when: () => true, to: "low" },
			])
			.build();

		expect(step.next?.type).toBe("conditional");
		if (step.next?.type === "conditional") {
			expect(step.next.branches).toHaveLength(2);
		}
	});

	test("should support resolver next", () => {
		const step = createStep<{ id: string }>("resolver")
			.nextResolver((data: { id: string }) => `step-${data.id}`)
			.build();

		expect(step.next?.type).toBe("resolver");
	});

	test("should wrap Standard Schema validators", async () => {
		const schema: StandardSchemaV1<{ age: number }> = {
			"~standard": {
				version: 1,
				vendor: "unit-test",
				validate: (value) => {
					const data = value as { age?: number };
					if (!data.age || data.age < 18) {
						return {
							issues: [{ message: "Must be adult", path: ["age"] }],
						};
					}

					return { value: { age: data.age } };
				},
			},
		};

		const step = createStep<{ age: number }>("schema")
			.validateWithSchema(schema)
			.build();

		const invalid = await step.validate?.({ age: 17 }, {});
		const valid = await step.validate?.({ age: 21 }, {});

		expect(invalid?.valid).toBe(false);
		expect(invalid?.errors).toEqual({ age: "Must be adult" });
		expect(valid?.valid).toBe(true);
	});
});

describe("WizardBuilder", () => {
	test("should build wizard with steps", () => {
		const wizard = createWizard<{ name: string }>("test-wizard")
			.initialStep("step1")
			.step("step1", (s) => s.title("Step 1").next("step2"))
			.step("step2", (s) => s.title("Step 2").previous("step1"))
			.onComplete(async () => {})
			.build();

		expect(wizard.id).toBe("test-wizard");
		expect(wizard.initialStepId).toBe("step1");
		expect(wizard.steps.step1).toBeDefined();
		expect(wizard.steps.step2).toBeDefined();
		expect(wizard.onComplete).toBeDefined();
	});

	test("should create linear sequence", () => {
		const wizard = createWizard<WizardData>("linear")
			.sequence([{ id: "step1" }, { id: "step2" }, { id: "step3" }])
			.build();

		expect(wizard.steps.step1.next).toEqual({ type: "static", to: "step2" });
		expect(wizard.steps.step2.previous).toEqual({
			type: "static",
			to: "step1",
		});
		expect(wizard.steps.step2.next).toEqual({ type: "static", to: "step3" });
		expect(wizard.steps.step3.previous).toEqual({
			type: "static",
			to: "step2",
		});
	});

	test("should auto-set initial step", () => {
		const wizard = createWizard<WizardData>("auto-initial")
			.addStep({ id: "first" })
			.addStep({ id: "second" })
			.build();

		expect(wizard.initialStepId).toBe("first");
	});

	test("should throw error without steps", () => {
		expect(() => {
			createWizard<WizardData>("empty").build();
		}).toThrow("Initial step is required");
	});
});
