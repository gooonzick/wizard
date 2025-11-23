import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
	combineValidators,
	createStandardSchemaValidator,
	requiredFields,
	type StandardSchemaValidatorOptions,
} from "../machine/validators";
import type { StepId, WizardContext, WizardData } from "../types/base";
import type {
	LifecycleHook,
	StepMeta,
	SubmitHandler,
	Validator,
	WizardStepDefinition,
} from "../types/step";
import type { StepGuard, StepTransition } from "../types/transitions";

/**
 * Fluent builder for creating wizard steps
 */
export class StepBuilder<T extends WizardData> {
	private step: Partial<WizardStepDefinition<T>> = {};

	constructor(id: StepId) {
		this.step.id = id;
	}

	/**
	 * Sets the previous step transition
	 */
	previous(transition: StepTransition<T> | StepId): this {
		if (typeof transition === "string") {
			this.step.previous = { type: "static", to: transition };
		} else {
			this.step.previous = transition;
		}
		return this;
	}

	/**
	 * Sets the next step transition
	 */
	next(transition: StepTransition<T> | StepId): this {
		if (typeof transition === "string") {
			this.step.next = { type: "static", to: transition };
		} else {
			this.step.next = transition;
		}
		return this;
	}

	/**
	 * Sets conditional next step
	 */
	nextWhen(branches: Array<{ when: StepGuard<T>; to: StepId }>): this {
		this.step.next = {
			type: "conditional",
			branches,
		};
		return this;
	}

	/**
	 * Sets dynamic next step resolver
	 */
	nextResolver(
		resolver: (
			data: T,
			ctx: WizardContext,
		) => Promise<StepId | null> | StepId | null,
	): this {
		this.step.next = {
			type: "resolver",
			resolve: resolver,
		};
		return this;
	}

	/**
	 * Sets step enabled state or guard
	 */
	enabled(value: boolean | StepGuard<T>): this {
		this.step.enabled = value;
		return this;
	}

	/**
	 * Sets step validator
	 */
	validate(validator: Validator<T>): this {
		this.step.validate = validator;
		return this;
	}

	/**
	 * Sets validator using a Standard Schema definition
	 */
	validateWithSchema<Schema extends StandardSchemaV1>(
		schema: Schema,
		options?: StandardSchemaValidatorOptions,
	): this {
		this.step.validate = createStandardSchemaValidator(
			schema,
			options,
		) as Validator<T>;
		return this;
	}

	/**
	 * Adds validation for required fields (composes with existing validators)
	 * @example
	 * step.required('firstName', 'lastName')
	 * step.required('email', { messages: { email: 'Please enter your email' } })
	 */
	required(...fields: Array<keyof T>): this {
		const requiredValidator = requiredFields<T>(...fields);

		if (this.step.validate) {
			// Compose with existing validator
			this.step.validate = combineValidators(
				this.step.validate,
				requiredValidator,
			);
		} else {
			this.step.validate = requiredValidator;
		}
		return this;
	}

	/**
	 * Sets onEnter lifecycle hook
	 */
	onEnter(hook: LifecycleHook<T>): this {
		this.step.onEnter = hook;
		return this;
	}

	/**
	 * Sets onLeave lifecycle hook
	 */
	onLeave(hook: LifecycleHook<T>): this {
		this.step.onLeave = hook;
		return this;
	}

	/**
	 * Sets submit handler
	 */
	onSubmit(handler: SubmitHandler<T>): this {
		this.step.onSubmit = handler;
		return this;
	}

	/**
	 * Sets step metadata
	 */
	meta(meta: StepMeta): this {
		this.step.meta = { ...this.step.meta, ...meta };
		return this;
	}

	/**
	 * Sets step title
	 */
	title(title: string): this {
		return this.meta({ title });
	}

	/**
	 * Sets step description
	 */
	description(description: string): this {
		return this.meta({ description });
	}

	/**
	 * Sets step icon
	 */
	icon(icon: string): this {
		return this.meta({ icon });
	}

	/**
	 * Builds the final step definition
	 */
	build(): WizardStepDefinition<T> {
		if (!this.step.id) {
			throw new Error("Step ID is required");
		}

		return this.step as WizardStepDefinition<T>;
	}
}

/**
 * Creates a new step builder
 */
export function createStep<T extends WizardData>(id: StepId): StepBuilder<T> {
	return new StepBuilder<T>(id);
}
