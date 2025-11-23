import { describe, expect, test } from "vitest";
import type {
	SyncOrAsync,
	ValidationResult,
	WizardContext,
} from "../src/types/base";
import type { StepTransition } from "../src/types/transitions";

describe("Base Types", () => {
	test("SyncOrAsync should accept sync values", () => {
		const sync: SyncOrAsync<number> = 42;
		expect(sync).toBe(42);
	});

	test("SyncOrAsync should accept Promise values", () => {
		const async: SyncOrAsync<number> = Promise.resolve(42);
		expect(async).toBeInstanceOf(Promise);
	});

	test("ValidationResult should have correct shape", () => {
		const valid: ValidationResult = { valid: true };
		const invalid: ValidationResult = {
			valid: false,
			errors: { field: "error" },
		};

		expect(valid.valid).toBe(true);
		expect(invalid.errors).toBeDefined();
	});

	test("WizardContext should be extensible", () => {
		interface ExtendedContext extends WizardContext {
			customField: string;
		}

		const ctx: ExtendedContext = { customField: "value" };
		expect(ctx.customField).toBe("value");
	});
});

describe("Transition Types", () => {
	test("Static transition should have correct type", () => {
		const transition: StepTransition<unknown> = {
			type: "static",
			to: "nextStep",
		};

		expect(transition.type).toBe("static");
		expect(transition.to).toBe("nextStep");
	});

	test("Conditional transition should support multiple branches", () => {
		const transition: StepTransition<{ age: number }> = {
			type: "conditional",
			branches: [
				{ when: (d: { age: number }) => d.age >= 18, to: "adult" },
				{ when: (d: { age: number }) => d.age < 18, to: "minor" },
			],
		};

		expect(transition.branches).toHaveLength(2);
	});

	test("Resolver transition should accept async functions", () => {
		const transition: StepTransition<unknown> = {
			type: "resolver",
			resolve: async () => "dynamicStep",
		};

		expect(transition.type).toBe("resolver");
	});
});
