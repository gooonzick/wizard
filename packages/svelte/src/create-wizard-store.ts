import type { WizardData } from "@gooonzick/wizard-core";
import {
	createMachineAndManager,
	createWizardActions,
} from "@gooonzick/wizard-state";
import { onDestroy } from "svelte";
import type { Writable } from "svelte/store";
import { createChannelStore } from "./internal/channel-store";
import type {
	CreateWizardStoreOptions,
	WizardSnapshot,
	WizardStore,
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

	const { machine, manager } = createMachineAndManager<T>({
		definition,
		context,
		initialData,
		getCallbacks: () => callbacks,
		plugins,
	});

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

	// ---- actions (shared with every binding via @gooonzick/wizard-state) ----
	// Loading flags are reference-counted by `manager.trackLoading()`, so a
	// busy-rejected double click cannot clear the flag of the operation still in
	// flight. `reset`/`restore` are fire-and-forget; their failures (e.g. a
	// malformed snapshot raising WizardRestoreError) surface on `onError`.
	const { goNext, goPrevious, goBack, goTo, goToStep, ...actions } =
		createWizardActions(manager, (error: unknown): void => {
			callbacks.onError?.(
				error instanceof Error ? error : new Error(String(error)),
			);
		});

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
