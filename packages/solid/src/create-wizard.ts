import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import { createSignal, getOwner, onCleanup } from "solid-js";
import type {
	CreateWizardOptions,
	Wizard,
	WizardField,
	WizardStoreActions,
} from "./types";

/**
 * Creates a signal-backed wizard.
 *
 * The four manager channels (state / validation / navigation / loading) are
 * mirrored into four signals. The manager hands out frozen, cached snapshots and
 * keeps an unaffected channel's reference, so Solid's default `===` equality
 * skips signals whose channel did not change.
 */
export function createWizard<T extends WizardData>(
	options: CreateWizardOptions<T>,
): Wizard<T> {
	const {
		definition,
		initialData,
		context = {},
		plugins,
		autoDestroy = true,
		...callbacks
	} = options;

	// Forward references. The machine may fire onStateChange synchronously from its
	// constructor (initializeFirstStep) BEFORE these are assigned — hence the guard.
	let managerRef: WizardStateManager<T> | null = null;
	let previousState: WizardState<T> | null = null;

	const machine = new WizardMachine<T>(
		definition,
		context,
		initialData,
		{
			onStateChange: (newState: WizardState<T>) => {
				const oldState = previousState;
				previousState = newState;
				if (oldState && managerRef) {
					managerRef.handleStateChange(newState, oldState);
				}
				callbacks.onStateChange?.(newState);
			},
			onStepEnter: (stepId: StepId, data: T) =>
				callbacks.onStepEnter?.(stepId, data),
			onStepLeave: (stepId: StepId, data: T) =>
				callbacks.onStepLeave?.(stepId, data),
			onComplete: (data: T) => callbacks.onComplete?.(data),
			onCancel: async (data: T) => {
				await callbacks.onCancel?.(data);
			},
			onReset: () => callbacks.onReset?.(),
			onError: (error: Error) => callbacks.onError?.(error),
			onDataChange: (prev: T, next: T, changedFields: (keyof T)[]) =>
				callbacks.onDataChange?.(prev, next, changedFields),
		},
		plugins,
	);

	const manager = new WizardStateManager(machine, definition.initialStepId);
	managerRef = manager;
	previousState = machine.snapshot;

	const reportError = (error: unknown): void => {
		callbacks.onError?.(
			error instanceof Error ? error : new Error(String(error)),
		);
	};

	const [stateSnapshot, setStateSnapshot] = createSignal(
		manager.getStateSnapshot(),
	);
	const [validationSnapshot, setValidationSnapshot] = createSignal(
		manager.getValidationSnapshot(),
	);
	const [navigationSnapshot, setNavigationSnapshot] = createSignal(
		manager.getNavigationSnapshot(),
	);
	const [loadingSnapshot, setLoadingSnapshot] = createSignal(
		manager.getLoadingSnapshot(),
	);

	const syncSignals = (): void => {
		setStateSnapshot(manager.getStateSnapshot());
		setNavigationSnapshot(manager.getNavigationSnapshot());
		setValidationSnapshot(manager.getValidationSnapshot());
		setLoadingSnapshot(manager.getLoadingSnapshot());
	};

	// One "all" subscription: the manager refreshes every affected channel cache
	// BEFORE notifying, and "all" listeners fire on every notify (including the
	// async navigation recompute and loading changes). Released by destroy().
	manager.subscribe(syncSignals, "all");

	const withNavigating = async (fn: () => Promise<void>): Promise<void> => {
		manager.setLoadingState({ isNavigating: true });
		try {
			await fn();
		} finally {
			manager.setLoadingState({ isNavigating: false });
		}
	};

	const goNext = () => withNavigating(() => machine.goNext());
	const goPrevious = () => withNavigating(() => machine.goPrevious());
	const goBack = (steps = 1) => withNavigating(() => machine.goBack(steps));
	const goTo = (stepId: StepId, opts?: GoToOptions) =>
		withNavigating(() => machine.goTo(stepId, opts));
	const goToStep = (stepId: StepId) => goTo(stepId, { skipValidation: true });

	const actions: WizardStoreActions<T> = {
		updateData: (updater) => machine.updateData(updater),
		setData: (data) => machine.setData(data),
		// Direct call — preserves the Object.is no-op guard and changedFields=[field].
		updateField: (field, value) => machine.updateField(field, value),
		validate: async () => {
			manager.setLoadingState({ isValidating: true });
			try {
				await machine.validate();
			} finally {
				manager.setLoadingState({ isValidating: false });
			}
		},
		validateAll: async (opts) => {
			manager.setLoadingState({ isValidating: true });
			try {
				return await machine.validateAll(opts);
			} finally {
				manager.setLoadingState({ isValidating: false });
			}
		},
		canSubmit: () => machine.canSubmit(),
		submit: async () => {
			manager.setLoadingState({ isSubmitting: true });
			try {
				await machine.submit();
			} finally {
				manager.setLoadingState({ isSubmitting: false });
			}
		},
		// Fire-and-forget, but the machine's synchronous reset()/restore() can throw
		// (a malformed snapshot raises WizardRestoreError, which the machine does NOT
		// route through handleError). Terminating the chain here keeps it from
		// becoming an unhandled rejection and surfaces it on onError instead.
		reset: (data?: T) => {
			void manager.runReset(data ?? initialData).catch(reportError);
		},
		cancel: () => manager.runCancel(),
		serialize: () => machine.serialize(),
		restore: (serialized: WizardSerializedState<T>) => {
			void manager.runRestore(serialized).catch(reportError);
		},
	};

	const fields = new Map<keyof T, unknown>();
	const field = <K extends keyof T>(key: K): WizardField<T[K]> => {
		const cached = fields.get(key);
		if (cached) {
			return cached as WizardField<T[K]>;
		}
		const f: WizardField<T[K]> = {
			get value() {
				return stateSnapshot().data[key];
			},
			set value(v: T[K]) {
				machine.updateField(key, v);
			},
		};
		fields.set(key, f);
		return f;
	};

	let destroyed = false;
	const destroy = async (): Promise<void> => {
		if (destroyed) return;
		destroyed = true;
		await manager.destroy();
	};

	// Only register cleanup under an owner: outside one, Solid's onCleanup would
	// log a dev warning and never run. Without an owner the caller owns destroy().
	if (autoDestroy && getOwner()) {
		onCleanup(() => {
			void destroy();
		});
	}

	return {
		get currentStepId() {
			return stateSnapshot().currentStepId;
		},
		get currentStep() {
			return stateSnapshot().currentStep;
		},
		get data() {
			return stateSnapshot().data;
		},
		get isCompleted() {
			return stateSnapshot().isCompleted;
		},
		get stepStatuses() {
			return stateSnapshot().stepStatuses;
		},
		get progress() {
			return stateSnapshot().progress;
		},
		get isValid() {
			return validationSnapshot().isValid;
		},
		get validationErrors() {
			return validationSnapshot().validationErrors;
		},
		get canGoNext() {
			return navigationSnapshot().canGoNext;
		},
		get canGoPrevious() {
			return navigationSnapshot().canGoPrevious;
		},
		get canGoBack() {
			return navigationSnapshot().canGoBack;
		},
		get isFirstStep() {
			return navigationSnapshot().isFirstStep;
		},
		get isLastStep() {
			return navigationSnapshot().isLastStep;
		},
		get visitedSteps() {
			return navigationSnapshot().visitedSteps;
		},
		get availableSteps() {
			return navigationSnapshot().availableSteps;
		},
		get stepHistory() {
			return navigationSnapshot().stepHistory;
		},
		get isValidating() {
			return loadingSnapshot().isValidating;
		},
		get isSubmitting() {
			return loadingSnapshot().isSubmitting;
		},
		get isNavigating() {
			return loadingSnapshot().isNavigating;
		},
		get state() {
			return stateSnapshot();
		},
		get validation() {
			return validationSnapshot();
		},
		get navigation() {
			return navigationSnapshot();
		},
		get loading() {
			return loadingSnapshot();
		},
		actions,
		goNext,
		goPrevious,
		goBack,
		goTo,
		goToStep,
		field,
		getMachine: () => machine,
		getManager: () => manager,
		destroy,
		get isDestroyed() {
			return destroyed || manager.isDestroyed;
		},
	};
}
