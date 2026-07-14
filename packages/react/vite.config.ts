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
			formats: ["es"],
			fileName: "index",
		},
		outDir: "./dist",
		rollupOptions: {
			external: [
				"react",
				"react-dom",
				"react/jsx-runtime",
				// "react/jsx-dev-runtime",
				"@gooonzick/wizard-core",
				"@gooonzick/wizard-state",
			],
		},
	},
});
