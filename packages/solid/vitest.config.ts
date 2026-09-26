import { resolve } from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// `vite-plugin-solid` compiles the `.tsx` tests and, in test mode, already
	// selects Solid's browser + development build. Do NOT add `resolve.conditions`:
	// an explicit list would REPLACE Vite's default client conditions.
	plugins: [solid()],
	resolve: {
		alias: {
			// MANDATORY: run tests against core/state TypeScript SOURCES, not dist
			// (same as packages/react, packages/vue and packages/svelte).
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
			"@gooonzick/wizard-state": resolve(__dirname, "../state/src/index.ts"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.{ts,tsx}"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/types.ts"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 60,
				lines: 70,
			},
		},
	},
});
