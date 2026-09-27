import type {
	PersistedWizardSnapshot,
	WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";
import { flushPromises } from "@vue/test-utils";

export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

/** A promise whose settlement is controlled manually by the test. */
export function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/**
 * Settles every pending microtask AND one macrotask turn (the persistence
 * write queue and `manager.destroy()` are fire-and-forget promise chains).
 */
export async function settle(): Promise<void> {
	await flushPromises();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await flushPromises();
}

/** Synchronous in-memory storage adapter shared across mounts. */
export interface MemoryAdapter<T> extends WizardPersistenceAdapter<T> {
	stored: PersistedWizardSnapshot<T> | null;
	saves: number;
	clears: number;
}

export function createMemoryAdapter<T>(): MemoryAdapter<T> {
	const adapter: MemoryAdapter<T> = {
		stored: null,
		saves: 0,
		clears: 0,
		load: () => (adapter.stored ? structuredClone(adapter.stored) : null),
		save: (snapshot) => {
			adapter.saves += 1;
			adapter.stored = structuredClone(snapshot);
		},
		clear: () => {
			adapter.clears += 1;
			adapter.stored = null;
		},
	};
	return adapter;
}

/**
 * Asynchronous in-memory adapter: every `load()` returns a promise the test
 * resolves explicitly via `resolveLoad()`; writes are synchronous so the
 * stored value is observable right after the write queue drains.
 */
export interface AsyncMemoryAdapter<T> extends MemoryAdapter<T> {
	pendingLoads: number;
	/** Resolves the oldest pending `load()` with the current stored value. */
	resolveLoad: () => void;
}

export function createAsyncMemoryAdapter<T>(): AsyncMemoryAdapter<T> {
	const loads: Deferred<PersistedWizardSnapshot<T> | null>[] = [];
	const base = createMemoryAdapter<T>();
	const adapter: AsyncMemoryAdapter<T> = {
		...base,
		get pendingLoads() {
			return loads.length;
		},
		load: () => {
			const d = deferred<PersistedWizardSnapshot<T> | null>();
			loads.push(d);
			return d.promise;
		},
		save: (snapshot) => {
			adapter.saves += 1;
			adapter.stored = structuredClone(snapshot);
		},
		clear: () => {
			adapter.clears += 1;
			adapter.stored = null;
		},
		resolveLoad: () => {
			const d = loads.shift();
			if (!d) {
				throw new Error("no pending load()");
			}
			d.resolve(adapter.stored ? structuredClone(adapter.stored) : null);
		},
	};
	return adapter;
}
