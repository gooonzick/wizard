import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, test } from "vitest";
import {
	combineValidators,
	createStandardSchemaValidator,
	requiredFields,
} from "../src/machine/validators";
import type { Validator } from "../src/types/step";

describe("requiredFields", () => {
	test("should validate required fields are present", async () => {
		const validator = requiredFields<{ name: string; email: string }>(
			"name",
			"email",
		);

		const valid = await validator(
			{ name: "John", email: "john@example.com" },
			{},
		);
		expect(valid.valid).toBe(true);

		const invalid = await validator(
			{ name: "", email: "john@example.com" },
			{},
		);
		expect(invalid.valid).toBe(false);
		expect(invalid.errors?.name).toBeDefined();
	});

	test("should handle null and undefined", async () => {
		const validator = requiredFields<{ field?: string }>("field");

		const nullResult = await validator({ field: undefined }, {});
		expect(nullResult.valid).toBe(false);

		const undefinedResult = await validator({ field: undefined }, {});
		expect(undefinedResult.valid).toBe(false);
	});
});

describe("combineValidators", () => {
	test("should combine multiple validators with AND logic", async () => {
		const validator1: Validator<{ age: number }> = (data) => ({
			valid: data.age >= 18,
			errors: data.age < 18 ? { age: "Must be adult" } : undefined,
		});

		const validator2: Validator<{ age: number }> = (data) => ({
			valid: data.age <= 100,
			errors: data.age > 100 ? { age: "Invalid age" } : undefined,
		});

		const combined = combineValidators(validator1, validator2);

		const valid = await combined({ age: 25 }, {});
		expect(valid.valid).toBe(true);
	});

	test("should merge error messages", async () => {
		const emailValidator: Validator<{ email: string }> = (data) => ({
			valid: data.email.includes("@"),
			errors: !data.email.includes("@")
				? { email: "Invalid email" }
				: undefined,
		});

		const lengthValidator: Validator<{ email: string }> = (data) => ({
			valid: data.email.length >= 5,
			errors: data.email.length < 5 ? { length: "Too short" } : undefined,
		});

		const combined = combineValidators(emailValidator, lengthValidator);
		const result = await combined({ email: "ab" }, {});

		expect(result.valid).toBe(false);
		expect(result.errors).toHaveProperty("email");
		expect(result.errors).toHaveProperty("length");
	});
});

describe("createStandardSchemaValidator", () => {
	const schema: StandardSchemaV1<{ email: string; age: number }> = {
		"~standard": {
			version: 1,
			vendor: "unit-test",
			validate: (value) => {
				const issues: StandardSchemaV1.Issue[] = [];

				const data = value as { email?: string; age?: number };
				if (!data.email?.includes("@")) {
					issues.push({ message: "Invalid email", path: ["email"] });
				}

				if (!data.age || data.age < 18) {
					issues.push({ message: "Must be adult", path: ["age"] });
				}

				if (issues.length > 0) {
					return { issues };
				}

				if (!data.email || !data.age) {
					return { issues: [] };
				}

				return { value: { email: data.email, age: data.age } };
			},
		},
	};

	test("returns valid when schema passes", async () => {
		const validator = createStandardSchemaValidator(schema);
		const result = await validator({ email: "user@example.com", age: 25 }, {});
		expect(result.valid).toBe(true);
		expect(result.errors).toBeUndefined();
	});

	test("maps issues to field errors", async () => {
		const validator = createStandardSchemaValidator(schema);
		const result = await validator({ email: "user", age: 16 }, {});

		expect(result.valid).toBe(false);
		expect(result.errors).toEqual({
			email: "Invalid email",
			age: "Must be adult",
		});
	});

	test("supports custom issue mapping", async () => {
		const validator = createStandardSchemaValidator(schema, {
			mapIssueToField: (issue) =>
				issue.path?.map(String).join(".") ?? "general",
			formatMessage: (issue) => `ERR:${issue.message}`,
		});

		const result = await validator({ email: "missing-at", age: 17 }, {});

		expect(result.valid).toBe(false);
		expect(result.errors?.email).toBe("ERR:Invalid email");
	});
});
