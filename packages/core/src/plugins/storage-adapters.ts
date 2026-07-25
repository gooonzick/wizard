import { WizardRestoreError } from "../errors";
import type {
	PersistedWizardSnapshot,
	WizardPersistenceAdapter,
} from "./persistence";

/** Minimal structural subset of the Web Storage API (injectable for tests/SSR). */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface WebStorageAdapterOptions {
	/** Explicit storage; when omitted the matching global is resolved lazily. */
	storage?: StorageLike;
}

/**
 * Lazy + throw-safe: the module must never touch a browser global at import time
 * (SSR / node), and reading `globalThis.localStorage` itself can throw in hardened
 * or private-mode browsers.
 */
function resolveStorage(
	kind: "local" | "session",
	override?: StorageLike,
): StorageLike | null {
	if (override) return override;
	try {
		const g = globalThis as {
			localStorage?: StorageLike;
			sessionStorage?: StorageLike;
		};
		return (kind === "local" ? g.localStorage : g.sessionStorage) ?? null;
	} catch {
		return null;
	}
}

function createWebStorageAdapter<TData>(
	kind: "local" | "session",
	key: string,
	options?: WebStorageAdapterOptions,
): WizardPersistenceAdapter<TData> {
	return {
		load(): PersistedWizardSnapshot<TData> | null {
			const s = resolveStorage(kind, options?.storage);
			if (!s) return null; // SSR / disabled
			let raw: string | null;
			try {
				raw = s.getItem(key);
			} catch {
				return null;
			}
			if (raw === null) return null;
			try {
				return JSON.parse(raw) as PersistedWizardSnapshot<TData>;
			} catch {
				throw new WizardRestoreError(
					`Stored wizard snapshot at "${key}" is not valid JSON`,
				);
			}
		},
		save(snapshot: PersistedWizardSnapshot<TData>): void {
			const s = resolveStorage(kind, options?.storage);
			if (!s) return; // silent no-op on SSR: save() runs on every keystroke
			// Quota / cyclic data throws -> the plugin reports it via onSaveError.
			s.setItem(key, JSON.stringify(snapshot));
		},
		clear(): void {
			const s = resolveStorage(kind, options?.storage);
			if (!s) return;
			try {
				s.removeItem(key);
			} catch {
				/* ignore */
			}
		},
	};
}

/**
 * `localStorage`-backed adapter. Storage is resolved lazily per call, so importing
 * this module is safe on the server. Namespace the key per wizard, e.g.
 * `localStorageAdapter(\`wizard:${definition.id}\`)` — two wizards sharing a key
 * destroy each other's progress.
 */
export function localStorageAdapter<TData>(
	key: string,
	options?: WebStorageAdapterOptions,
): WizardPersistenceAdapter<TData> {
	return createWebStorageAdapter<TData>("local", key, options);
}

/** `sessionStorage`-backed adapter. Same contract as `localStorageAdapter`. */
export function sessionStorageAdapter<TData>(
	key: string,
	options?: WebStorageAdapterOptions,
): WizardPersistenceAdapter<TData> {
	return createWebStorageAdapter<TData>("session", key, options);
}
