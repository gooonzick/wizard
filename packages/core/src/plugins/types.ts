import type { WizardError } from "../errors";
import type {
	WizardSerializedState,
	WizardState,
} from "../machine/wizard-machine";
import type { StepId } from "../types/base";
import type { StepStatus, WizardStepDefinition } from "../types/step";

/**
 * Recursive readonly mapped type. Compile-time only — applied to plugin hook
 * payloads so plugins cannot mutate the machine's live state references.
 * Zero runtime cost: payloads are NOT cloned. Functions are left untouched.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends ReadonlyArray<infer U>
		? ReadonlyArray<DeepReadonly<U>>
		: T extends object
			? { readonly [K in keyof T]: DeepReadonly<T[K]> }
			: T;

/** Payload passed to beforeTransition / afterTransition. */
export interface TransitionEvent<TData> {
	type: "next" | "previous" | "goTo";
	fromStepId: StepId;
	toStepId: StepId;
	data: DeepReadonly<TData>;
	timestamp: number;
}

/** Context passed to a plugin's onError hook. */
export interface ErrorContext<TData> {
	stepId: StepId;
	phase:
		| "validation"
		| "transition"
		| "lifecycle"
		| "submit"
		| "data"
		| "state";
	data: DeepReadonly<TData>;
}

/**
 * Read-only machine view passed to onInit so plugins can inspect, not mutate.
 *
 * WIZ-006: `serialize`, `restore` and `isBusy` are OPTIONAL so hand-rolled facades
 * (tests, third-party plugin harnesses) written against the original 3-member shape keep
 * compiling. The real WizardMachine facade always provides all three; a plugin that needs
 * them MUST feature-detect and degrade gracefully.
 */
export interface WizardMachineReadonly<TData> {
	readonly snapshot: DeepReadonly<WizardState<TData>>;
	readonly currentStep: DeepReadonly<WizardStepDefinition<TData>>;
	getStepStatus(stepId: StepId): StepStatus;
	/** True while a navigation/submit is in flight (WizardMachine.isBusy). */
	readonly isBusy?: boolean;
	/** JSON-safe snapshot of the runtime state (WizardMachine.serialize). */
	serialize?(): WizardSerializedState<TData>;
	/** Re-applies a serialized snapshot in place; throws WizardRestoreError when invalid. */
	restore?(state: WizardSerializedState<TData>): void;
}

/**
 * A runtime plugin registered on a WizardMachine. All hooks are optional
 * except `name` (unique; used by removePlugin).
 */
export interface WizardPlugin<TData = unknown> {
	name: string;
	onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;
	/** Return `false` to veto the transition (silent cancel). */
	beforeTransition?(
		e: TransitionEvent<TData>,
	): boolean | undefined | Promise<boolean | undefined>;
	afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;
	onError?(
		error: WizardError | Error,
		ctx: ErrorContext<TData>,
	): void | Promise<void>;
	onComplete?(data: DeepReadonly<TData>): void | Promise<void>;
	onReset?(): void | Promise<void>;
	/**
	 * Fired after a data mutation that changed at least one top-level field.
	 * Fire-and-forget: may be async (void | Promise<void>); the data update is
	 * synchronous and does NOT await this hook. A throw/rejection is isolated
	 * and routed to onError (phase "data"). Data params are DeepReadonly. WIZ-010.
	 */
	onDataChange?(
		prevData: DeepReadonly<TData>,
		nextData: DeepReadonly<TData>,
		changedFields: readonly (keyof TData)[],
	): void | Promise<void>;
	destroy?(): void | Promise<void>;
}
