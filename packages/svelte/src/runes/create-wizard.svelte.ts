/// <reference types="svelte" />

// NOTE: the machine/manager wiring below is intentionally duplicated from
// ../internal/wiring.ts. `src/runes/**` must be self-contained because
// `svelte-package` emits declarations with libRoot=src/runes; an import that
// escapes libRoot yields dangling .d.ts references.

import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
	WizardState,
} from "@gooonzick/wizard-core";
import { WizardMachine } from "@gooonzick/wizard-core";
import { WizardStateManager } from "@gooonzick/wizard-state";
import { onDestroy } from "svelte";
import type {
	CreateWizardOptions,
	Wizard,
	WizardField,
	WizardStoreActions,
} from "./types";

/**
 * Creates a rune-native wizard.
 *
 * There is deliberately no `$effect` anywhere here: outside a component `$effect`
 * requires `$effect.root()` and manual disposal, which is a teardown hazard for a
 * library. All reactivity is `$state.raw` reassignment driven by manager
 * subscriptions.
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

	// Forward references. The machine fires onStateChange synchronously from its
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

	// $state.raw, NOT $state: the manager returns frozen/cached snapshot objects.
	// A deep $state proxy would (a) fight Object.freeze and (b) destroy the
	// reference-equality gating the manager relies on.
	let stateSnapshot = $state.raw(manager.getStateSnapshot());
	let validationSnapshot = $state.raw(manager.getValidationSnapshot());
	let navigationSnapshot = $state.raw(manager.getNavigationSnapshot());
	let loadingSnapshot = $state.raw(manager.getLoadingSnapshot());

	// Subscriptions are opened once and released by destroy() (manager.destroy()
	// clears every subscriber set). Never tie them to component lifetime.
	manager.subscribe(() => {
		stateSnapshot = manager.getStateSnapshot();
	}, "state");
	manager.subscribe(() => {
		validationSnapshot = manager.getValidationSnapshot();
	}, "validation");
	manager.subscribe(() => {
		navigationSnapshot = manager.getNavigationSnapshot();
	}, "navigation");
	manager.subscribe(() => {
		loadingSnapshot = manager.getLoadingSnapshot();
	}, "loading");

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

	// `reset`/`restore` are fire-and-forget (`void`, React parity), but the
	// machine's synchronous reset()/restore() can throw — a malformed snapshot
	// raises WizardRestoreError, which the machine does NOT route through
	// handleError. Terminating the chain here keeps a bad snapshot from becoming
	// an unhandled rejection and surfaces it on `onError` instead.
	const reportError = (error: unknown): void => {
		callbacks.onError?.(
			error instanceof Error ? error : new Error(String(error)),
		);
	};

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
				return stateSnapshot.data[key];
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

	if (autoDestroy) {
		try {
			onDestroy(() => {
				void destroy();
			});
		} catch {
			// intentionally empty — created outside a component, caller owns destroy()
		}
	}

	return {
		get currentStepId() {
			return stateSnapshot.currentStepId;
		},
		get currentStep() {
			return stateSnapshot.currentStep;
		},
		get data() {
			return stateSnapshot.data;
		},
		get isCompleted() {
			return stateSnapshot.isCompleted;
		},
		get stepStatuses() {
			return stateSnapshot.stepStatuses;
		},
		get progress() {
			return stateSnapshot.progress;
		},
		get isValid() {
			return validationSnapshot.isValid;
		},
		get validationErrors() {
			return validationSnapshot.validationErrors;
		},
		get canGoNext() {
			return navigationSnapshot.canGoNext;
		},
		get canGoPrevious() {
			return navigationSnapshot.canGoPrevious;
		},
		get canGoBack() {
			return navigationSnapshot.canGoBack;
		},
		get isFirstStep() {
			return navigationSnapshot.isFirstStep;
		},
		get isLastStep() {
			return navigationSnapshot.isLastStep;
		},
		get visitedSteps() {
			return navigationSnapshot.visitedSteps;
		},
		get availableSteps() {
			return navigationSnapshot.availableSteps;
		},
		get stepHistory() {
			return navigationSnapshot.stepHistory;
		},
		get isValidating() {
			return loadingSnapshot.isValidating;
		},
		get isSubmitting() {
			return loadingSnapshot.isSubmitting;
		},
		get isNavigating() {
			return loadingSnapshot.isNavigating;
		},
		get state() {
			return stateSnapshot;
		},
		get validation() {
			return validationSnapshot;
		},
		get navigation() {
			return navigationSnapshot;
		},
		get loading() {
			return loadingSnapshot;
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
