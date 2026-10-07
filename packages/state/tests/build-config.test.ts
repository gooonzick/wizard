import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("build config", () => {
	it("keeps every @gooonzick/wizard-core entry external", () => {
		// Bundling core into wizard-state ships a second copy of WizardMachine and
		// the error classes, so `instanceof WizardValidationError` /
		// `WizardStepLoadError` fails for errors thrown by binding-created machines.
		const source = readFileSync(
			new URL("../vite.config.ts", import.meta.url),
			"utf8",
		);
		// A regex (not a bare string) so subpath entries such as
		// "@gooonzick/wizard-core/foo" are externalized too.
		expect(source).toContain(
			String.raw`external: [/^@gooonzick\/wizard-core(\/|$)/]`,
		);
	});
});
