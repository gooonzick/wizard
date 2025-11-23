import type { StepId, WizardContext } from "../types/base";
import type { StepGuard, StepTransition } from "../types/transitions";

/**
 * Resolves a transition to determine the next step ID
 */
export async function resolveTransition<T>(
	transition: StepTransition<T> | undefined,
	data: T,
	ctx: WizardContext,
): Promise<StepId | null> {
	if (!transition) {
		return null;
	}

	switch (transition.type) {
		case "static":
			return transition.to;

		case "conditional":
			for (const branch of transition.branches) {
				const canProceed = await branch.when(data, ctx);
				if (canProceed) {
					return branch.to;
				}
			}
			return null;

		case "resolver":
			return transition.resolve(data, ctx);

		default: {
			// TypeScript exhaustiveness check
			const exhaustiveCheck: never = transition;
			return exhaustiveCheck;
		}
	}
}

/**
 * Evaluates a guard to determine if it passes
 */
export async function evaluateGuard<T>(
	guard: boolean | StepGuard<T> | undefined,
	data: T,
	ctx: WizardContext,
): Promise<boolean> {
	if (guard === undefined) {
		return true;
	}
	if (typeof guard === "boolean") {
		return guard;
	}
	return guard(data, ctx);
}

/**
 * Creates a guard that combines multiple guards with AND logic
 */
export function andGuards<T>(...guards: StepGuard<T>[]): StepGuard<T> {
	return async (data: T, ctx: WizardContext) => {
		for (const guard of guards) {
			const result = await guard(data, ctx);
			if (!result) {
				return false;
			}
		}
		return true;
	};
}

/**
 * Creates a guard that combines multiple guards with OR logic
 */
export function orGuards<T>(...guards: StepGuard<T>[]): StepGuard<T> {
	return async (data: T, ctx: WizardContext) => {
		for (const guard of guards) {
			const result = await guard(data, ctx);
			if (result) {
				return true;
			}
		}
		return false;
	};
}

/**
 * Creates a guard that negates another guard
 */
export function notGuard<T>(guard: StepGuard<T>): StepGuard<T> {
	return async (data: T, ctx: WizardContext) => {
		const result = await guard(data, ctx);
		return !result;
	};
}
