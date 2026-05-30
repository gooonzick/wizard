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
			entry: {
				index: "./src/index.ts",
				plugins: "./src/plugins/index.ts",
			},
			name: "WizardCore",
			formats: ["es"],
		},
		outDir: "./dist",
	},
});
