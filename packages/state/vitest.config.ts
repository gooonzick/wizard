import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
		},
	},
	test: {
		include: ["tests/**/*.test.ts"],
		globals: true,
	},
});
