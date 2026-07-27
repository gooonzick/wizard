import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [svelte(), svelteTesting()],
	resolve: {
		// Svelte 5 resolves its SSR build under node conditions, which makes
		// `mount()` throw `lifecycle_function_unavailable` in jsdom. Force browser.
		conditions: ["browser"],
		alias: {
			// MANDATORY: run tests against core/state TypeScript SOURCES, not dist
			// (this is what packages/react and packages/vue do).
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
			"@gooonzick/wizard-state": resolve(__dirname, "../state/src/index.ts"),
			// NOTE: no `svelte -> node_modules/svelte` alias here (unlike
			// packages/vue's `vue` alias). A path alias bypasses Svelte's exports
			// map and makes `svelte/internal/client` unresolvable. There is only one
			// copy of Svelte in this workspace, so no alias is needed.
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/types.ts", "src/runes/types.ts"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 60,
				lines: 70,
			},
		},
	},
});
