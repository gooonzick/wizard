import { describe, expect, it } from "vitest";

describe("plugin barrels", () => {
	it("exposes plugin public API from the subpath barrel (src)", async () => {
		const mod = await import("../src/plugins/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
		expect(typeof mod.createAnalyticsPlugin).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});

	it("re-exports createLoggingPlugin from the main barrel", async () => {
		const mod = await import("../src/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});

	it("re-exports createAnalyticsPlugin from the main barrel", async () => {
		const mod = await import("../src/index");
		expect(typeof mod.createAnalyticsPlugin).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});

	it("exposes the persistence API from the subpath barrel (src)", async () => {
		const mod = await import("../src/plugins/index");
		expect(typeof mod.createPersistencePlugin).toBe("function");
		expect(typeof mod.localStorageAdapter).toBe("function");
		expect(typeof mod.sessionStorageAdapter).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});

	it("re-exports createPersistencePlugin and the storage adapters from the main barrel", async () => {
		const mod = await import("../src/index");
		expect(typeof mod.createPersistencePlugin).toBe("function");
		expect(typeof mod.localStorageAdapter).toBe("function");
		expect(typeof mod.sessionStorageAdapter).toBe("function");
	});
});
