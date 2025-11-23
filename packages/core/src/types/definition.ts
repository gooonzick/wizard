import type { StepId, SyncOrAsync, WizardContext } from "./base";
import type { WizardStepDefinition } from "./step";

/**
 * Complete handler for wizard completion
 */
export type CompleteHandler<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<void>;

/**
 * Complete declarative definition of a wizard
 */
export interface WizardDefinition<T> {
	id: string;
	initialStepId: StepId;
	steps: Record<StepId, WizardStepDefinition<T>>;

	// Final handler (optional)
	onComplete?: CompleteHandler<T>;
}
