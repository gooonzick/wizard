import type { StepId, SyncOrAsync, WizardContext } from "./base";

/**
 * Guard function that determines if a step or transition branch is available
 */
export type StepGuard<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<boolean>;

/**
 * Dynamic resolver function for determining next step
 */
export type StepTransitionResolver<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<StepId | null>;

/**
 * Conditional branch definition
 */
export interface ConditionalBranch<T> {
	when: StepGuard<T>;
	to: StepId;
}

/**
 * Step transition can be:
 * - static: direct transition to a specific step
 * - conditional: branching based on guards
 * - resolver: dynamic transition via resolver function
 */
export type StepTransition<T> =
	| { type: "static"; to: StepId }
	| { type: "conditional"; branches: ConditionalBranch<T>[] }
	| { type: "resolver"; resolve: StepTransitionResolver<T> };
