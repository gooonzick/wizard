import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		react(),
		dts({
			include: ["src"],
			exclude: ["tests"],
			tsconfigPath: "./tsconfig.build.json",
		}),
	],
	build: {
		lib: {
			entry: "./src/index.ts",
			name: "WizardReact",
			formats: ["es", "umd"],
			fileName: (format) => `index.${format === "es" ? "js" : "umd.cjs"}`,
		},
		outDir: "./dist",
		rollupOptions: {
			external: [
				"react",
				"react-dom",
				"react/jsx-runtime",
				// "react/jsx-dev-runtime",
				"@wizard/core",
			],
			output: {
				globals: {
					react: "React",
					"react-dom": "ReactDOM",
					"react/jsx-runtime": "ReactJSXRuntime",
					// "react/jsx-dev-runtime": "ReactJSXDevRuntime",
					"@wizard/core": "WizardCore",
				},
			},
		},
	},
});
