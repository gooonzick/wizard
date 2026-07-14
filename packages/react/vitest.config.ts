import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@gooonzick/wizard-core": resolve(__dirname, "../core/src/index.ts"),
			"@gooonzick/wizard-state": resolve(__dirname, "../state/src/index.ts"),
		},
	},
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
		globals: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 65,
				lines: 70,
			},
		},
	},
});
