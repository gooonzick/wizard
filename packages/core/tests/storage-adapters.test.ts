import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardRestoreError } from "../src/errors";
import type { PersistedWizardSnapshot } from "../src/plugins/persistence";
import type { StorageLike } from "../src/plugins/storage-adapters";
import {
	localStorageAdapter,
	sessionStorageAdapter,
} from "../src/plugins/storage-adapters";

interface D extends Record<string, unknown> {
	value: number;
}

const envelope: PersistedWizardSnapshot<D> = {
	envelope: 1,
	version: 1,
	savedAt: 1_700_000_000_000,
	state: {
		version: 1,
		currentStepId: "b",
		data: { value: 1 },
		isValid: true,
		isCompleted: false,
		stepStatuses: { a: "completed", b: "active" },
		visitedSteps: ["a", "b"],
		history: ["a", "b"],
	},
};

const fakeStorage = () => {
	const map = new Map<string, string>();
	return {
		map,
		getItem: vi.fn((key: string) => map.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			map.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			map.delete(key);
		}),
	} satisfies StorageLike & { map: Map<string, string> };
};

describe("web storage adapters", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("round-trips an envelope through an injected storage", () => {
		const storage = fakeStorage();
		const adapter = localStorageAdapter<D>("k", { storage });

		adapter.save(envelope);
		expect(storage.setItem).toHaveBeenCalledWith("k", JSON.stringify(envelope));
		expect(adapter.load()).toEqual(envelope);

		adapter.clear();
		expect(storage.removeItem).toHaveBeenCalledWith("k");
		expect(adapter.load()).toBeNull();
	});

	it("returns null when nothing is stored", () => {
		expect(
			localStorageAdapter<D>("missing", { storage: fakeStorage() }).load(),
		).toBeNull();
	});

	it("throws WizardRestoreError on invalid JSON", () => {
		const storage = fakeStorage();
		storage.map.set("k", "{not json");
		expect(() => localStorageAdapter<D>("k", { storage }).load()).toThrow(
			WizardRestoreError,
		);
	});

	it("returns null when getItem throws", () => {
		const storage = fakeStorage();
		storage.getItem.mockImplementation(() => {
			throw new Error("blocked");
		});
		expect(localStorageAdapter<D>("k", { storage }).load()).toBeNull();
	});

	it("does not throw when removeItem throws", () => {
		const storage = fakeStorage();
		storage.removeItem.mockImplementation(() => {
			throw new Error("blocked");
		});
		expect(() =>
			localStorageAdapter<D>("k", { storage }).clear(),
		).not.toThrow();
	});

	it("propagates a setItem failure (quota) so the plugin can report it", () => {
		const storage = fakeStorage();
		storage.setItem.mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});
		expect(() =>
			localStorageAdapter<D>("k", { storage }).save(envelope),
		).toThrow("QuotaExceededError");
	});

	it("is inert on SSR / node where no storage global exists", () => {
		expect(
			(globalThis as { localStorage?: unknown }).localStorage,
		).toBeUndefined();
		const adapter = localStorageAdapter<D>("k");
		expect(adapter.load()).toBeNull();
		expect(() => adapter.save(envelope)).not.toThrow();
		expect(() => adapter.clear()).not.toThrow();
	});

	it("resolves globalThis.localStorage lazily when no storage option is given", () => {
		const storage = fakeStorage();
		vi.stubGlobal("localStorage", storage);
		const adapter = localStorageAdapter<D>("k");

		adapter.save(envelope);
		expect(storage.setItem).toHaveBeenCalledTimes(1);
		expect(adapter.load()).toEqual(envelope);
	});

	it("sessionStorageAdapter touches sessionStorage, not localStorage", () => {
		const local = fakeStorage();
		const session = fakeStorage();
		vi.stubGlobal("localStorage", local);
		vi.stubGlobal("sessionStorage", session);

		sessionStorageAdapter<D>("k").save(envelope);

		expect(session.setItem).toHaveBeenCalledTimes(1);
		expect(local.setItem).not.toHaveBeenCalled();
	});

	it("has no import-time side effects", async () => {
		vi.stubGlobal("localStorage", undefined);
		await expect(
			import("../src/plugins/storage-adapters"),
		).resolves.toBeDefined();
	});
});
