import { describe, expectTypeOf, test } from "vitest";
import type {
	SyncOrAsync,
	ValidationResult,
	WizardContext,
} from "../src/types/base";
import type { StepTransition } from "../src/types/transitions";

describe("Base Types", () => {
	test("SyncOrAsync should accept sync values", () => {
		expectTypeOf<42>().toMatchTypeOf<SyncOrAsync<number>>();
	});

	test("SyncOrAsync should accept Promise values", () => {
		expectTypeOf<Promise<number>>().toMatchTypeOf<SyncOrAsync<number>>();
	});

	test("ValidationResult should have correct shape", () => {
		expectTypeOf<ValidationResult>().toHaveProperty("valid");
		expectTypeOf<{ valid: true }>().toMatchTypeOf<ValidationResult>();
		expectTypeOf<{
			valid: false;
			errors: { field: string };
		}>().toMatchTypeOf<ValidationResult>();
	});

	test("WizardContext should be extensible", () => {
		interface ExtendedContext extends WizardContext {
			customField: string;
		}

		expectTypeOf<ExtendedContext>().toMatchTypeOf<WizardContext>();
		expectTypeOf<{ customField: "value" }>().toMatchTypeOf<ExtendedContext>();
	});
});

describe("Transition Types", () => {
	test("Static transition should have correct type", () => {
		expectTypeOf<{
			type: "static";
			to: "nextStep";
		}>().toMatchTypeOf<StepTransition<unknown>>();
	});

	test("Conditional transition should support multiple branches", () => {
		type Conditional = Extract<
			StepTransition<{ age: number }>,
			{ type: "conditional" }
		>;
		expectTypeOf<Conditional>().toHaveProperty("branches");
	});

	test("Resolver transition should accept async functions", () => {
		type Resolver = Extract<StepTransition<unknown>, { type: "resolver" }>;
		expectTypeOf<Resolver>().toHaveProperty("resolve");
	});
});
