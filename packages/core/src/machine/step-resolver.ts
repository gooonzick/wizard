import type { StepId, WizardContext, WizardData } from "../types/base";
import type { WizardStepDefinition } from "../types/step";
import type { StepTransition } from "../types/transitions";
import { evaluateGuard, resolveTransition } from "./transitions";
import { WizardNavigationError } from "../errors";

/**
 * Configuration for step resolution
 */
interface StepResolutionConfig {
	direction: "next" | "previous";
	getTransition: (step: WizardStepDefinition<any>) => StepTransition<any> | undefined;
	getNextTransition: (step: WizardStepDefinition<any>) => StepTransition<any> | undefined;
}

/**
 * Resolves a step in a given direction (next or previous), skipping disabled steps
 * and protecting against circular dependencies
 *
 * @param currentStep Current step to start from
 * @param steps Map of all steps
 * @param data Wizard data for guard evaluation
 * @param ctx Wizard context for guard evaluation
 * @param config Resolution configuration
 * @returns Resolved step ID or null if no step available
 * @throws WizardNavigationError if circular dependency detected or step not found
 */
export async function resolveStepInDirection<T extends WizardData>(
	currentStep: WizardStepDefinition<T>,
	steps: Record<StepId, WizardStepDefinition<T>>,
	data: T,
	ctx: WizardContext,
	config: StepResolutionConfig,
): Promise<StepId | null> {
	const visited = new Set<StepId>();
	const initialTransition = config.getTransition(currentStep);

	if (!initialTransition) {
		return null;
	}

	let stepId = await resolveTransition(initialTransition, data, ctx);

	// Skip disabled steps (with circular dependency protection)
	while (stepId) {
		// Check for circular dependency
		if (visited.has(stepId)) {
			throw new WizardNavigationError(
				`Circular step dependency detected at step "${stepId}"`,
				stepId,
				"circular",
			);
		}
		visited.add(stepId);

		const step = steps[stepId];
		if (!step) {
			throw new WizardNavigationError(
				`Step "${stepId}" not found`,
				stepId,
				"not-found",
			);
		}

		const isEnabled = await evaluateGuard(step.enabled, data, ctx);

		if (isEnabled) {
			return stepId;
		}

		// Try to get the next step after the disabled one
		const nextTransition = config.getNextTransition(step);
		if (nextTransition) {
			stepId = await resolveTransition(nextTransition, data, ctx);
		} else {
			return null;
		}
	}

	return null;
}
