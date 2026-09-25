import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	// NOTE: `vite-plugin-solid` is deliberately NOT used here. `src/` contains no
	// JSX (WizardProvider is built with `createComponent`), so the library is plain
	// TypeScript and needs no `"solid"` export condition.
	plugins: [
		dts({
			include: ["src"],
			exclude: ["tests"],
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
		emptyOutDir: true,
		rollupOptions: {
			external: [
				"solid-js",
				"solid-js/web",
				"@gooonzick/wizard-core",
				"@gooonzick/wizard-state",
			],
		},
	},
});
