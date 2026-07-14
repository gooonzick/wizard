import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			// Explicitly resolve 'vue' to the actual vue package, not our workspace package
			vue: resolve(__dirname, "node_modules/vue"),
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
			"@gooonzick/wizard-state": resolve(__dirname, "../state/src/index.ts"),
		},
	},
	test: {
		environment: "happy-dom",
		include: ["tests/**/*.test.ts"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/types.ts"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 60,
				lines: 70,
			},
		},
	},
});
