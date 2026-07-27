import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [svelte()],
	// `@gooonzick/wizard-svelte/runes` ships UNCOMPILED runes and is linked through
	// `workspace:*`. `@sveltejs/vite-plugin-svelte` normally excludes it automatically
	// via the `"svelte"` export condition, but being explicit removes a whole class of
	// "`$state` is not defined" bugs and doubles as documentation.
	optimizeDeps: {
		exclude: ["@gooonzick/wizard-svelte"],
	},
});
