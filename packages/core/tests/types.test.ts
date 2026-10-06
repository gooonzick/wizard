import { describe, expectTypeOf, test } from "vitest";
import { createStep } from "../src/builders/create-step";
import type {
	SyncOrAsync,
	ValidationResult,
	WizardContext,
} from "../src/types/base";
import type { LazyStepImplementation, StepLoader } from "../src/types/step";
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

describe("StepBuilder.required types", () => {
	type Form = { email: string; name: string };

	test("accepts a trailing RequiredFieldsOptions object (JSDoc example)", () => {
		const step = createStep<Form>("contact");
		expectTypeOf(step.required).toBeCallableWith("email", {
			messages: { email: "Please enter your email" },
		});
		expectTypeOf(step.required).toBeCallableWith("email", "name");
		// Compile-only usage mirroring the JSDoc example.
		step.required("email", { messages: { email: "Please enter your email" } });
		step.required("name", { defaultMessage: "{field} is mandatory" });
	});

	test("still rejects unknown field names and unknown message keys", () => {
		const step = createStep<Form>("contact");
		// @ts-expect-error - "nope" is not a key of Form
		step.required("nope");
		// @ts-expect-error - messages keys must be keys of Form
		step.required("email", { messages: { nope: "x" } });
	});
});

describe("WIZ-013 lazy step types", () => {
	type D = { name: string };

	test("LazyStepImplementation has exactly the four hook keys", () => {
		expectTypeOf<keyof LazyStepImplementation<D>>().toEqualTypeOf<
			"validate" | "onEnter" | "onLeave" | "onSubmit"
		>();
	});

	test("StepLoader accepts bare and default-export module shapes", () => {
		expectTypeOf<() => Promise<{ onEnter: () => void }>>().toMatchTypeOf<
			StepLoader<D>
		>();
		expectTypeOf<
			() => Promise<{ default: { validate: () => { valid: true } } }>
		>().toMatchTypeOf<StepLoader<D>>();
	});

	test("StepLoader rejects results that only carry skeleton keys", () => {
		expectTypeOf<
			() => Promise<{ next: { type: "static"; to: string } }>
		>().not.toMatchTypeOf<StepLoader<D>>();
	});
});
