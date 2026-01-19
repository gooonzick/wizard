import type { StepId, WizardContext, WizardData } from "../types/base";
import type { CompleteHandler, WizardDefinition } from "../types/definition";
import type { WizardStepDefinition } from "../types/step";
import { StepBuilder } from "./create-step";

/**
 * Fluent builder for creating wizards
 */
export class WizardBuilder<T extends WizardData> {
	private id: string;
	private initialStepId?: StepId;
	private steps: Map<StepId, WizardStepDefinition<T>> = new Map();
	private completeHandler?: CompleteHandler<T>;

	constructor(id: string) {
		this.id = id;
	}

	/**
	 * Sets the initial step
	 */
	initialStep(stepId: StepId): this {
		this.initialStepId = stepId;
		return this;
	}

	/**
	 * Adds a step to the wizard
	 */
	addStep(step: WizardStepDefinition<T>): this {
		this.steps.set(step.id, step);
		// Set initial step if it's the first one
		if (!this.initialStepId && this.steps.size === 1) {
			this.initialStepId = step.id;
		}
		return this;
	}

	/**
	 * Adds a step using a builder
	 */
	step(id: StepId, configure: (builder: StepBuilder<T>) => void): this {
		const builder = new StepBuilder<T>(id);
		configure(builder);
		return this.addStep(builder.build());
	}

	/**
	 * Creates a linear sequence of steps
	 */
	sequence(
		stepConfigs: Array<{
			id: StepId;
			configure?: (builder: StepBuilder<T>) => void;
		}>,
	): this {
		for (let i = 0; i < stepConfigs.length; i++) {
			const config = stepConfigs[i];
			const builder = new StepBuilder<T>(config.id);

			// Auto-link to previous and next steps
			if (i > 0) {
				builder.previous(stepConfigs[i - 1].id);
			}
			if (i < stepConfigs.length - 1) {
				builder.next(stepConfigs[i + 1].id);
			}

			// Apply custom configuration
			if (config.configure) {
				config.configure(builder);
			}

			this.addStep(builder.build());
		}

		return this;
	}

	/**
	 * Sets the completion handler
	 */
	onComplete(handler: CompleteHandler<T>): this {
		this.completeHandler = handler;
		return this;
	}

	/**
	 * Builds the final wizard definition
	 */
	build(): WizardDefinition<T> {
		if (!this.initialStepId) {
			throw new Error("Initial step is required");
		}

		if (this.steps.size === 0) {
			throw new Error("At least one step is required");
		}

		// Validate that initial step exists
		if (!this.steps.has(this.initialStepId)) {
			throw new Error(
				`Initial step "${this.initialStepId}" not found in steps`,
			);
		}

		const stepsRecord: Record<StepId, WizardStepDefinition<T>> = {};
		for (const [id, step] of this.steps) {
			stepsRecord[id] = step;
		}

		return {
			id: this.id,
			initialStepId: this.initialStepId,
			steps: stepsRecord,
			onComplete: this.completeHandler,
		};
	}
}

/**
 * Creates a new wizard builder
 */
export function createWizard<T extends WizardData>(
	id: string,
): WizardBuilder<T> {
	return new WizardBuilder<T>(id);
}

/**
 * Helper to create a simple linear wizard
 */
export function createLinearWizard<T extends WizardData>(config: {
	id: string;
	steps: Array<{
		id: StepId;
		title?: string;
		description?: string;
		validate?: (
			data: T,
			ctx: WizardContext,
		) => Promise<{ valid: boolean; errors?: Record<string, string> }>;
		onSubmit?: (data: T, ctx: WizardContext) => Promise<void>;
	}>;
	onComplete?: (data: T, ctx: WizardContext) => Promise<void>;
}): WizardDefinition<T> {
	const builder = createWizard<T>(config.id);

	builder.sequence(
		config.steps.map((step) => ({
			id: step.id,
			configure: (b) => {
				if (step.title) b.title(step.title);
				if (step.description) b.description(step.description);
				if (step.validate) b.validate(step.validate);
				if (step.onSubmit) b.onSubmit(step.onSubmit);
			},
		})),
	);

	if (config.onComplete) {
		builder.onComplete(config.onComplete);
	}

	return builder.build();
}
