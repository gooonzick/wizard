import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
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
			name: "WizardState",
			fileName: "index",
			formats: ["es"],
		},
		outDir: "./dist",
		rollupOptions: {
			// Never bundle core (nor any of its subpath entries): consumers must
			// share one copy of the machine and error classes
			// (`instanceof WizardValidationError` etc.).
			external: [/^@gooonzick\/wizard-core(\/|$)/],
		},
	},
});
