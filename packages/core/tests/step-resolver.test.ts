import { describe, it, expect } from "vitest";
import { createWizard } from "../src/index";
import { WizardMachine } from "../src/machine/wizard-machine";
import { resolveStepInDirection } from "../src/machine/step-resolver";

describe("resolveStepInDirection", () => {
	it("should resolve next enabled step", async () => {
		const definition = createWizard<{ value: string }>("test")
			.sequence([{ id: "step1" }, { id: "step2" }, { id: "step3" }])
			.build();

		const step1 = definition.steps["step1"];

		const nextId = await resolveStepInDirection(
			step1,
			definition.steps,
			{ value: "" },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId).toBe("step2");
	});

	it("should skip disabled steps when going next", async () => {
		const definition = createWizard<{ skip: boolean }>("test")
			.step("step1", (b) => {
				b.next({ type: "static", to: "step2" });
			})
			.step("step2", (b) => {
				b.next({ type: "static", to: "step3" });
				b.enabled(false); // disabled
			})
			.step("step3", (b) => {})
			.build();

		const step1 = definition.steps["step1"];

		const nextId = await resolveStepInDirection(
			step1,
			definition.steps,
			{ skip: false },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId).toBe("step3");
	});

	it("should skip disabled steps when going previous", async () => {
		const definition = createWizard<{ skip: boolean }>("test")
			.step("step1", (b) => {})
			.step("step2", (b) => {
				b.previous({ type: "static", to: "step1" });
			})
			.step("step3", (b) => {
				b.previous({ type: "static", to: "step2" });
			})
			.build();

		definition.steps["step2"].enabled = false; // disable step2

		const step3 = definition.steps["step3"];

		const previousId = await resolveStepInDirection(
			step3,
			definition.steps,
			{ skip: false },
			{},
			{
				direction: "previous",
				getTransition: (s) => s.previous,
				getNextTransition: (s) => s.previous,
			},
		);

		expect(previousId).toBe("step1");
	});

	it("should return null when no transition defined", async () => {
		const definition = createWizard<{ value: string }>("test")
			.step("step1", (b) => {
				// No next defined
			})
			.build();

		const step1 = definition.steps["step1"];

		const nextId = await resolveStepInDirection(
			step1,
			definition.steps,
			{ value: "" },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId).toBeNull();
	});

	it("should throw on missing step", async () => {
		const definition = createWizard<{ value: string }>("test")
			.step("step1", (b) => {
				// Points to non-existent step
				b.next({ type: "static", to: "step999" });
			})
			.build();

		const step1 = definition.steps["step1"];

		await expect(
			resolveStepInDirection(
				step1,
				definition.steps,
				{ value: "" },
				{},
				{
					direction: "next",
					getTransition: (s) => s.next,
					getNextTransition: (s) => s.next,
				},
			),
		).rejects.toThrow('Step "step999" not found');
	});

	it("should handle conditional transitions", async () => {
		const definition = createWizard<{ age: number }>("test")
			.step("step1", (b) => {
				b.nextWhen([
					{ when: (data) => data.age >= 18, to: "step2" },
					{ when: () => true, to: "step3" },
				]);
			})
			.step("step2", (b) => {})
			.step("step3", (b) => {})
			.build();

		const step1 = definition.steps["step1"];

		// Adult path
		const nextId1 = await resolveStepInDirection(
			step1,
			definition.steps,
			{ age: 25 },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId1).toBe("step2");

		// Minor path
		const nextId2 = await resolveStepInDirection(
			step1,
			definition.steps,
			{ age: 15 },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId2).toBe("step3");
	});

	it("should work with context guards", async () => {
		const definition = createWizard<{ value: string }>("test")
			.step("step1", (b) => {
				b.next({ type: "static", to: "step2" });
			})
			.step("step2", (b) => {
				b.next({ type: "static", to: "step3" });
				b.enabled((_, ctx) => !!(ctx as any).allowStep2);
			})
			.step("step3", (b) => {})
			.build();

		const step1 = definition.steps["step1"];

		// Without context flag
		const nextId1 = await resolveStepInDirection(
			step1,
			definition.steps,
			{ value: "" },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId1).toBe("step3");

		// With context flag
		const nextId2 = await resolveStepInDirection(
			step1,
			definition.steps,
			{ value: "" },
			{ allowStep2: true } as any,
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId2).toBe("step2");
	});

	it("should return null when all subsequent steps are disabled", async () => {
		const definition = createWizard<{ value: string }>("test")
			.step("step1", (b) => {
				b.next({ type: "static", to: "step2" });
			})
			.step("step2", (b) => {
				b.enabled(false);
			})
			.build();

		const step1 = definition.steps["step1"];

		const nextId = await resolveStepInDirection(
			step1,
			definition.steps,
			{ value: "" },
			{},
			{
				direction: "next",
				getTransition: (s) => s.next,
				getNextTransition: (s) => s.next,
			},
		);

		expect(nextId).toBeNull();
	});
});
