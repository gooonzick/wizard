import type {
	GoToOptions,
	StepId,
	ValidationSummary,
	WizardData,
	WizardSerializedState,
} from "@gooonzick/wizard-core";
import type { WizardStateManager } from "./manager";

/**
 * The imperative action surface every binding exposes.
 */
export interface WizardBindingActions<T extends WizardData> {
	updateData: (updater: (data: T) => T) => void;
	setData: (data: T) => void;
	updateField: <K extends keyof T>(field: K, value: T[K]) => void;
	validate: () => Promise<void>;
	validateAll: (options?: {
		updateStatuses?: boolean;
	}) => Promise<ValidationSummary>;
	canSubmit: () => Promise<boolean>;
	submit: () => Promise<void>;
	reset: (data?: T) => void;
	cancel: () => Promise<void>;
	serialize: () => WizardSerializedState<T>;
	restore: (state: WizardSerializedState<T>) => void;
	goNext: () => Promise<void>;
	goPrevious: () => Promise<void>;
	goBack: (steps?: number) => Promise<void>;
	goTo: (stepId: StepId, options?: GoToOptions) => Promise<void>;
	goToStep: (stepId: StepId) => Promise<void>;
	/** WIZ-013: prefetch a lazy step's implementation (no loading flag). */
	preloadStep: (stepId: StepId) => Promise<void>;
}

/**
 * Builds the binding action callbacks on top of a manager.
 *
 * - Data mutators call the machine directly (updateField keeps its Object.is
 *   no-op guard).
 * - validate/validateAll hold "isValidating", submit holds "isSubmitting", and
 *   navigation holds "isNavigating", all via the reference-counted
 *   `manager.trackLoading()`: a busy-rejected double click does not clear the
 *   flag of the navigation still in flight.
 * - reset/restore are fire-and-forget; their failures (e.g. a malformed
 *   snapshot raising WizardRestoreError) go to `reportError` instead of
 *   becoming unhandled rejections. `reset(data)` passes `data` through
 *   unchanged, so `reset()` uses the machine's current reset baseline.
 */
export function createWizardActions<T extends WizardData>(
	manager: WizardStateManager<T>,
	reportError: (error: unknown) => void,
): WizardBindingActions<T> {
	const machine = manager.getMachine();

	const navigating = (fn: () => Promise<void>): Promise<void> =>
		manager.trackLoading("isNavigating", fn);

	const goTo = (stepId: StepId, options?: GoToOptions): Promise<void> =>
		navigating(() => machine.goTo(stepId, options));

	return {
		updateData: (updater) => machine.updateData(updater),
		setData: (data) => machine.setData(data),
		updateField: (field, value) => machine.updateField(field, value),
		validate: () =>
			manager.trackLoading("isValidating", async () => {
				await machine.validate();
			}),
		validateAll: (options) =>
			manager.trackLoading("isValidating", () => machine.validateAll(options)),
		canSubmit: () => machine.canSubmit(),
		submit: () => manager.trackLoading("isSubmitting", () => machine.submit()),
		reset: (data) => {
			void manager.runReset(data).catch(reportError);
		},
		cancel: () => manager.runCancel(),
		serialize: () => machine.serialize(),
		restore: (state) => {
			void manager.runRestore(state).catch(reportError);
		},
		goNext: () => navigating(() => machine.goNext()),
		goPrevious: () => navigating(() => machine.goPrevious()),
		goBack: (steps) => navigating(() => machine.goBack(steps)),
		goTo,
		goToStep: (stepId) => goTo(stepId, { skipValidation: true }),
		preloadStep: (stepId) => machine.preloadStep(stepId),
	};
}
