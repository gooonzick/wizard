import type {
	StepId,
	SyncOrAsync,
	ValidationResult,
	WizardContext,
} from "./base";
import type { StepGuard, StepTransition } from "./transitions";

/**
 * Runtime lifecycle status of a wizard step
 */
export type StepStatus =
	| "pristine"
	| "active"
	| "visited"
	| "completed"
	| "error"
	| "skipped";

/**
 * Aggregated progress information derived from the wizard's runtime state.
 *
 * - `enabledStepIds` follows the insertion order of `definition.steps`,
 *   filtered by `stepStatuses[id] !== "skipped"`. Steps with a function-based
 *   `enabled` guard are reflected as soon as their status is recomputed.
 * - `currentStepIndex` is `-1` when the current step is currently skipped.
 * - `percentage` is rounded to the nearest integer in `[0, 100]`.
 */
export interface WizardProgress {
	totalSteps: number;
	enabledSteps: number;
	completedSteps: number;
	currentStepIndex: number;
	enabledStepIds: StepId[];
	percentage: number;
	isFirstStep: boolean;
	isLastStep: boolean;
}

/**
 * Validator function for step data
 */
export type Validator<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<ValidationResult>;

/**
 * Submit handler for step actions
 */
export type SubmitHandler<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<void>;

/**
 * Lifecycle hook
 */
export type LifecycleHook<T> = (
	data: T,
	ctx: WizardContext,
) => SyncOrAsync<void>;

/**
 * UI metadata for step presentation
 */
export interface StepMeta {
	title?: string;
	description?: string;
	icon?: string;
	[key: string]: unknown;
}

/**
 * Complete declarative definition of a wizard step
 */
export interface WizardStepDefinition<T> {
	id: StepId;

	// Navigation transitions
	previous?: StepTransition<T>;
	next?: StepTransition<T>;

	// Step availability
	enabled?: boolean | StepGuard<T>;

	// Validation strategy
	validate?: Validator<T>;

	// Lifecycle hooks
	onEnter?: LifecycleHook<T>;
	onLeave?: LifecycleHook<T>;

	// Action on step submit
	onSubmit?: SubmitHandler<T>;

	// UI metadata
	meta?: StepMeta;
}
