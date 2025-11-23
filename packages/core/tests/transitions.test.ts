import { describe, expect, test } from "vitest";
import {
	andGuards,
	notGuard,
	orGuards,
	resolveTransition,
} from "../src/machine/transitions";
import type { StepGuard, StepTransition } from "../src/types/transitions";

describe("resolveTransition", () => {
	test("should resolve static transition", async () => {
		const transition: StepTransition<unknown> = {
			type: "static",
			to: "nextStep",
		};

		const result = await resolveTransition(transition, {}, {});
		expect(result).toBe("nextStep");
	});

	test("should resolve conditional transition", async () => {
		const transition: StepTransition<{ premium: boolean }> = {
			type: "conditional",
			branches: [
				{ when: (d: { premium: boolean }) => d.premium, to: "premiumStep" },
				{ when: () => true, to: "basicStep" },
			],
		};

		const premiumResult = await resolveTransition(
			transition,
			{ premium: true },
			{},
		);
		expect(premiumResult).toBe("premiumStep");

		const basicResult = await resolveTransition(
			transition,
			{ premium: false },
			{},
		);
		expect(basicResult).toBe("basicStep");
	});

	test("should resolve dynamic transition", async () => {
		const transition: StepTransition<{ id: string }> = {
			type: "resolver",
			resolve: async (data: { id: string }) => `step-${data.id}`,
		};

		const result = await resolveTransition(transition, { id: "123" }, {});
		expect(result).toBe("step-123");
	});

	test("should return null for no matching branch", async () => {
		const transition: StepTransition<{ value: number }> = {
			type: "conditional",
			branches: [{ when: (d: { value: number }) => d.value > 10, to: "high" }],
		};

		const result = await resolveTransition(transition, { value: 5 }, {});
		expect(result).toBeNull();
	});
});

describe("Guard Combinators", () => {
	type TestData = { age: number; email?: string; plan?: string };
	const isAdult: StepGuard<TestData> = (d: TestData) => d.age >= 18;
	const hasEmail: StepGuard<TestData> = (d: TestData) => !!d.email;
	const isPremium: StepGuard<TestData> = (d: TestData) => d.plan === "premium";

	test("andGuards should require all guards to pass", async () => {
		const combined = andGuards(isAdult, hasEmail);

		const allTrue = await combined({ age: 25, email: "test@example.com" }, {});
		expect(allTrue).toBe(true);

		const oneFalse = await combined({ age: 15, email: "test@example.com" }, {});
		expect(oneFalse).toBe(false);
	});

	test("orGuards should require at least one guard to pass", async () => {
		const combined = orGuards(isAdult, isPremium);

		const bothTrue = await combined({ age: 25, plan: "premium" }, {});
		expect(bothTrue).toBe(true);

		const oneTrue = await combined({ age: 15, plan: "premium" }, {});
		expect(oneTrue).toBe(true);

		const noneTrue = await combined({ age: 15, plan: "basic" }, {});
		expect(noneTrue).toBe(false);
	});

	test("notGuard should negate the guard", async () => {
		const isMinor = notGuard(isAdult);

		const minor = await isMinor({ age: 15 }, {});
		expect(minor).toBe(true);

		const adult = await isMinor({ age: 25 }, {});
		expect(adult).toBe(false);
	});
});
