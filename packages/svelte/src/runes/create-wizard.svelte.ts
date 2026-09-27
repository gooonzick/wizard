/// <reference types="svelte" />

// `src/runes/**` must stay self-contained: `svelte-package` emits declarations
// with libRoot=src/runes, so a relative import escaping it yields dangling .d.ts
// references. Shared wiring comes from the `@gooonzick/wizard-state` package.

import type { WizardData } from "@gooonzick/wizard-core";
import {
	createMachineAndManager,
	createWizardActions,
} from "@gooonzick/wizard-state";
import { onDestroy } from "svelte";
import type { CreateWizardOptions, Wizard, WizardField } from "./types";

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

	const { machine, manager } = createMachineAndManager<T>({
		definition,
		context,
		initialData,
		getCallbacks: () => callbacks,
		plugins,
	});

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

	// Shared with every binding via @gooonzick/wizard-state. Loading flags are
	// reference-counted by `manager.trackLoading()`, so a busy-rejected double
	// click cannot clear the flag of the operation still in flight.
	// `reset`/`restore` are fire-and-forget; their failures (e.g. a malformed
	// snapshot raising WizardRestoreError) surface on `onError`.
	const { goNext, goPrevious, goBack, goTo, goToStep, ...actions } =
		createWizardActions(manager, (error: unknown): void => {
			callbacks.onError?.(
				error instanceof Error ? error : new Error(String(error)),
			);
		});

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
