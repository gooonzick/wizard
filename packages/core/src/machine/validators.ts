import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
	ValidationResult,
	WizardContext,
	WizardData,
} from "../types/base";
import type { Validator } from "../types/step";

type SchemaIssue = StandardSchemaV1.Issue;

type SchemaInput<Schema extends StandardSchemaV1> =
	StandardSchemaV1.InferInput<Schema> extends never
		? Record<string, unknown>
		: StandardSchemaV1.InferInput<Schema>;

export interface StandardSchemaValidatorOptions {
	mapIssueToField?: (issue: SchemaIssue) => string | undefined;
	formatMessage?: (issue: SchemaIssue) => string;
}

function extractFieldFromIssue(issue: SchemaIssue): string | undefined {
	if (!issue.path?.length) {
		return undefined;
	}

	const [first] = issue.path;
	if (typeof first === "object" && first !== null && "key" in first) {
		return String(first.key);
	}

	if (typeof first === "symbol") {
		return undefined;
	}

	return String(first);
}

const defaultIssueMessage = (issue: SchemaIssue): string =>
	issue.message ?? "Invalid value";

/**
 * Creates a validator that combines multiple validators
 */
export function combineValidators<T>(
	...validators: Validator<T>[]
): Validator<T> {
	return async (data: T, ctx: WizardContext): Promise<ValidationResult> => {
		const results = await Promise.all(validators.map((v) => v(data, ctx)));

		const allErrors = results.reduce(
			(acc, result) => {
				if (!result.valid && result.errors) {
					Object.assign(acc, result.errors);
				}
				return acc;
			},
			{} as Record<string, string>,
		);

		return {
			valid: results.every((r) => r.valid),
			errors: Object.keys(allErrors).length > 0 ? allErrors : undefined,
		};
	};
}

/**
 * Options for required fields validation
 */
export interface RequiredFieldsOptions<T> {
	/** Custom error messages per field */
	messages?: Partial<Record<keyof T, string>>;
	/** Default message template. Use {field} as placeholder */
	defaultMessage?: string;
}

/**
 * Creates a validator for required fields with customizable error messages
 */
export function requiredFields<T extends WizardData>(
	...args: Array<keyof T | RequiredFieldsOptions<T>>
): Validator<T> {
	// Extract options if last argument is an options object
	const lastArg = args[args.length - 1];
	const hasOptions =
		typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg);
	const options: RequiredFieldsOptions<T> = hasOptions
		? (lastArg as RequiredFieldsOptions<T>)
		: {};
	const fields = (hasOptions ? args.slice(0, -1) : args) as Array<keyof T>;

	const defaultMessage = options.defaultMessage ?? "{field} is required";

	return (data: T): ValidationResult => {
		const errors: Record<string, string> = {};

		for (const field of fields) {
			const value = data[field];
			if (value === undefined || value === null || value === "") {
				const message =
					options.messages?.[field] ??
					defaultMessage.replace("{field}", String(field));
				errors[String(field)] = message;
			}
		}

		return {
			valid: Object.keys(errors).length === 0,
			errors: Object.keys(errors).length > 0 ? errors : undefined,
		};
	};
}

/**
 * Creates a validator from a predicate function
 */
export function createValidator<T>(
	predicate: (data: T) => boolean,
	errorMessage: string,
	field?: string,
): Validator<T> {
	return (data: T): ValidationResult => {
		const valid = predicate(data);
		return {
			valid,
			errors: valid ? undefined : { [field || "general"]: errorMessage },
		};
	};
}

/**
 * Always valid validator (useful for steps without validation)
 */
export const alwaysValid: Validator<unknown> = () => ({ valid: true });

/**
 * Wraps a Standard Schema definition into a Wizard validator
 */
export function createStandardSchemaValidator<Schema extends StandardSchemaV1>(
	schema: Schema,
	options: StandardSchemaValidatorOptions = {},
): Validator<SchemaInput<Schema>> {
	return async (data): Promise<ValidationResult> => {
		const result = await schema["~standard"].validate(data);

		if (!result.issues) {
			return { valid: true };
		}

		const errors: Record<string, string> = {};

		for (const issue of result.issues) {
			const field =
				options.mapIssueToField?.(issue) ?? extractFieldFromIssue(issue);
			const message =
				options.formatMessage?.(issue) ?? defaultIssueMessage(issue);

			if (field) {
				errors[field] = message;
			} else if (errors.general) {
				errors.general = `${errors.general}; ${message}`;
			} else {
				errors.general = message;
			}
		}

		return {
			valid: false,
			errors: Object.keys(errors).length > 0 ? errors : undefined,
		};
	};
}
