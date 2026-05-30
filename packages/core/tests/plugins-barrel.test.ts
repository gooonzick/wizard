import { describe, expect, it } from "vitest";

describe("plugin barrels", () => {
	it("exposes plugin public API from the subpath barrel (src)", async () => {
		const mod = await import("../src/plugins/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});

	it("re-exports createLoggingPlugin from the main barrel", async () => {
		const mod = await import("../src/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
		expect((mod as Record<string, unknown>).PluginHost).toBeUndefined();
	});
});
