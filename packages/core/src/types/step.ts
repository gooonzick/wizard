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
 *   **Recomputation for function (and async) `enabled` guards happens at
 *   navigation time**: after the initial step is entered (construction and
 *   `reset()`, asynchronously) and after every committed `goNext`/
 *   `goPrevious`/`goTo`, folded into that navigation's state-change
 *   notification. A guard that returns false marks its step "skipped" (never
 *   the current step); a "skipped" step whose guard returns true again goes
 *   back to "pristine". It does NOT happen on `updateData`/`setData` — a data
 *   change that would flip such a guard's result does not update
 *   `stepStatuses`/`skipped` (and therefore `enabledStepIds`/`percentage`)
 *   until the next navigation. Only static `boolean` `enabled` guards are
 *   recalculated synchronously on data changes.
 * - On completion the final step is marked "completed", so a finished wizard
 *   reports `percentage === 100`.
 * - `currentStepIndex` is `-1` when the current step is currently skipped.
 * - `percentage` is rounded to the nearest integer in `[0, 100]`.
 * - `isLastStep` is `true` only when the current step's forward path is
 *   *definitively* terminal via synchronous resolution. When the next step is
 *   resolved asynchronously (async transition/guard), a resolver throws, or a
 *   cycle is detected, it is reported conservatively as `false`. For the
 *   authoritative last-step answer on async graphs, `await getNextStepId()` and
 *   check for `null`.
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

	// Lazily loaded implementation (WIZ-013): validate / onEnter / onLeave /
	// onSubmit. Transitions, `enabled` and `meta` always stay on the skeleton.
	load?: StepLoader<T>;

	// UI metadata
	meta?: StepMeta;
}

/**
 * The part of a step that may be loaded lazily (WIZ-013). Everything the
 * machine needs synchronously — transitions, `enabled`, `meta` — stays on the
 * eager step skeleton, so progress, `isLastStep` and disabled-step skipping
 * never wait for a load.
 */
export type LazyStepImplementation<T> = Pick<
	WizardStepDefinition<T>,
	"validate" | "onEnter" | "onLeave" | "onSubmit"
>;

/**
 * Loads a step implementation (WIZ-013), typically `() => import("./step")`.
 * A module namespace with a `default` export is accepted as well. Hooks from
 * the loaded implementation override same-named hooks on the skeleton.
 */
export type StepLoader<T> = () => Promise<
	LazyStepImplementation<T> | { default: LazyStepImplementation<T> }
>;
