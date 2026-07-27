import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	// NOTE: the `svelte()` plugin is deliberately NOT used here. The main entry is
	// plain TypeScript; the runes entry is packaged separately by `svelte-package`
	// (see package.json#scripts.build) because runes must ship uncompiled.
	plugins: [
		dts({
			include: ["src"],
			exclude: ["tests", "src/runes"],
			tsconfigPath: "./tsconfig.build.json",
		}),
	],
	build: {
		lib: {
			entry: "./src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
		outDir: "./dist",
		// `svelte-package` writes into ./dist/runes AFTER this build; never let Vite
		// empty the whole outDir on a rebuild ordering change.
		emptyOutDir: true,
		rollupOptions: {
			external: [
				"svelte",
				"svelte/store",
				"@gooonzick/wizard-core",
				"@gooonzick/wizard-state",
			],
		},
	},
});
