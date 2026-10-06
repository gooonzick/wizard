import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("build config", () => {
	it("keeps @gooonzick/wizard-core external", () => {
		// Bundling core into wizard-state ships a second copy of WizardMachine and
		// the error classes, so `instanceof WizardValidationError` /
		// `WizardStepLoadError` fails for errors thrown by binding-created machines.
		const source = readFileSync(
			new URL("../vite.config.ts", import.meta.url),
			"utf8",
		);
		expect(source).toMatch(/external:\s*\[[^\]]*"@gooonzick\/wizard-core"/);
	});
});
