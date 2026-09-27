import type {
	PersistedWizardSnapshot,
	WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";
import { type Mock, vi } from "vitest";
import { createDeferred, type Deferred } from "./deferred";

export interface MemoryAdapter<T> extends WizardPersistenceAdapter<T> {
	/** The record currently held in "storage" (a JSON round-tripped copy). */
	readonly stored: PersistedWizardSnapshot<T> | null;
	readonly save: Mock<(snapshot: PersistedWizardSnapshot<T>) => void>;
	readonly clear: Mock<() => void>;
	/** Async mode only: settles every pending `load()` with the stored record. */
	releaseLoads(): void;
}

/**
 * In-memory persistence adapter. In `async` mode every `load()` returns a
 * deferred promise the test releases explicitly via `releaseLoads()`.
 */
export function createMemoryAdapter<T>(
	mode: "sync" | "async",
): MemoryAdapter<T> {
	let stored: PersistedWizardSnapshot<T> | null = null;
	const pendingLoads: Deferred<PersistedWizardSnapshot<T> | null>[] = [];
	const snapshotCopy = () =>
		stored === null
			? null
			: (JSON.parse(JSON.stringify(stored)) as PersistedWizardSnapshot<T>);

	return {
		get stored() {
			return stored;
		},
		load() {
			if (mode === "sync") {
				return snapshotCopy();
			}
			const deferred = createDeferred<PersistedWizardSnapshot<T> | null>();
			pendingLoads.push(deferred);
			return deferred.promise;
		},
		save: vi.fn((snapshot: PersistedWizardSnapshot<T>) => {
			stored = JSON.parse(JSON.stringify(snapshot));
		}),
		clear: vi.fn(() => {
			stored = null;
		}),
		releaseLoads() {
			for (const deferred of pendingLoads.splice(0)) {
				deferred.resolve(snapshotCopy());
			}
		},
	};
}
