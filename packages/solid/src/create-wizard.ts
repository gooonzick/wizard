import type { WizardData } from "@gooonzick/wizard-core";
import {
	createMachineAndManager,
	createWizardActions,
} from "@gooonzick/wizard-state";
import { batch, createSignal, getOwner, onCleanup } from "solid-js";
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
 * mirrored into four signals. The manager hands out cached snapshots and
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

	// Shared wiring: the manager tracks the previous state itself and routes
	// its navigation-recompute errors to onError (console.error fallback).
	const { machine, manager } = createMachineAndManager<T>({
		definition,
		context,
		initialData,
		getCallbacks: () => callbacks,
		plugins,
	});

	// Errors the binding catches itself (isolated effect throws, reset/restore
	// failures). Without an onError they are logged rather than silently lost.
	const reportError = (error: unknown): void => {
		const err = error instanceof Error ? error : new Error(String(error));
		if (callbacks.onError) {
			callbacks.onError(err);
		} else {
			console.error(err);
		}
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
	manager.subscribe(() => {
		try {
			// Solid 1.x flushes effects on every unbatched write; batch() commits all
			// four channels atomically so no effect sees a half-applied transition.
			batch(syncSignals);
		} catch (error) {
			// Solid runs effects synchronously at the end of batch(), so a user effect
			// that throws without an <ErrorBoundary> lands here. Every notification
			// is reported from this catch first. For machine-originated ones core's
			// WizardMachine.notifyStateChange isolation is only a backstop, but
			// loading-channel notifications raised by this binding (trackLoading) and
			// the manager's async navigation recompute never pass through the
			// machine: without this catch they would reject the calling action or be
			// swallowed by the manager. Solid may leave sibling effects of this flush
			// stale; the wizard is intact.
			reportError(error);
		}
	}, "all");

	// Shared actions: loading flags are reference-counted (manager.trackLoading),
	// so a busy-rejected double click does not clear the flag of the navigation
	// still in flight; reset()/restore() failures go to reportError. reset(data)
	// passes data through, so reset() uses the machine's current baseline.
	const bindingActions = createWizardActions(manager, reportError);
	const { goNext, goPrevious, goTo } = bindingActions;

	// Solid deliberately exposes only the non-deprecated surface (no goBack /
	// goToStep), so pick the members of WizardStoreActions explicitly.
	const actions: WizardStoreActions<T> = {
		updateData: bindingActions.updateData,
		setData: bindingActions.setData,
		updateField: bindingActions.updateField,
		validate: bindingActions.validate,
		validateAll: bindingActions.validateAll,
		canSubmit: bindingActions.canSubmit,
		submit: bindingActions.submit,
		reset: bindingActions.reset,
		cancel: bindingActions.cancel,
		serialize: bindingActions.serialize,
		restore: bindingActions.restore,
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
		goTo,
		field,
		getMachine: () => machine,
		getManager: () => manager,
		destroy,
		get isDestroyed() {
			return destroyed || manager.isDestroyed;
		},
	};
}
