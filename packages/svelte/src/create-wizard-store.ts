import type {
	GoToOptions,
	StepId,
	WizardData,
	WizardSerializedState,
} from "@gooonzick/wizard-core";
import { onDestroy } from "svelte";
import type { Writable } from "svelte/store";
import { createChannelStore } from "./internal/channel-store";
import { createMachineAndManager } from "./internal/wiring";
import type {
	CreateWizardStoreOptions,
	WizardSnapshot,
	WizardStore,
	WizardStoreActions,
} from "./types";

/**
 * Creates a wizard bound to Svelte's classic store contract.
 *
 * The machine's lifetime is bound to this call and `destroy()`, NOT to the
 * subscriber count — an `{#if}` toggle that unmounts the only consumer must not
 * tear the wizard down.
 */
export function createWizardStore<T extends WizardData>(
	options: CreateWizardStoreOptions<T>,
): WizardStore<T> {
	const {
		definition,
		initialData,
		context = {},
		plugins,
		autoDestroy = true,
		...callbacks
	} = options;

	const { machine, manager } = createMachineAndManager(
		definition,
		context,
		initialData,
		callbacks,
		plugins,
	);

	// ---- per-channel stores ----
	const stateStore = createChannelStore(manager, "state", () =>
		manager.getStateSnapshot(),
	);
	const validationStore = createChannelStore(manager, "validation", () =>
		manager.getValidationSnapshot(),
	);
	const navigationStore = createChannelStore(manager, "navigation", () =>
		manager.getNavigationSnapshot(),
	);
	const loadingStore = createChannelStore(manager, "loading", () =>
		manager.getLoadingSnapshot(),
	);

	// ---- flat aggregate, memoised on the four cached slice references ----
	let aggregate: WizardSnapshot<T> | null = null;
	let keys: [unknown, unknown, unknown, unknown] | null = null;
	const readAggregate = (): WizardSnapshot<T> => {
		const s = manager.getStateSnapshot();
		const v = manager.getValidationSnapshot();
		const n = manager.getNavigationSnapshot();
		const l = manager.getLoadingSnapshot();
		if (
			aggregate &&
			keys &&
			keys[0] === s &&
			keys[1] === v &&
			keys[2] === n &&
			keys[3] === l
		) {
			return aggregate;
		}
		keys = [s, v, n, l];
		aggregate = { ...s, ...v, ...n, ...l };
		return aggregate;
	};
	const aggregateStore = createChannelStore(manager, "all", readAggregate);

	// ---- navigation (React semantics: manager owns the loading flags) ----
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

	// ---- field stores ----
	const fields = new Map<keyof T, Writable<T[keyof T]>>();
	const field = <K extends keyof T>(key: K): Writable<T[K]> => {
		const cached = fields.get(key);
		if (cached) {
			return cached as Writable<T[K]>;
		}
		const store: Writable<T[K]> = {
			subscribe(run) {
				let seeded = false;
				let last: T[K];
				return stateStore.subscribe((snapshot) => {
					const value = snapshot.data[key];
					if (!seeded || !Object.is(value, last)) {
						seeded = true;
						last = value;
						run(value);
					}
				});
			},
			set(value) {
				machine.updateField(key, value);
			},
			update(updater) {
				machine.updateField(key, updater(machine.snapshot.data[key]));
			},
		};
		fields.set(key, store as Writable<T[keyof T]>);
		return store;
	};

	// ---- teardown ----
	let destroyed = false;
	const destroy = async (): Promise<void> => {
		if (destroyed) return;
		destroyed = true;
		await manager.destroy();
	};

	if (autoDestroy) {
		try {
			// Throws `lifecycle_outside_component` when not called during component
			// initialisation — that is a supported usage, the caller owns destroy().
			onDestroy(() => {
				void destroy();
			});
		} catch {
			// intentionally empty
		}
	}

	return {
		subscribe: aggregateStore.subscribe,
		state: stateStore,
		validation: validationStore,
		navigation: navigationStore,
		loading: loadingStore,
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
