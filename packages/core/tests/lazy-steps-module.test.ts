import { describe, expect, it } from "vitest";
import { WizardError, WizardStepLoadError } from "../src/errors";

describe("WizardStepLoadError", () => {
	it("carries the step id, a stable message, and the cause", () => {
		const cause = new Error("chunk failed");
		const err = new WizardStepLoadError("documents", { cause });

		expect(err).toBeInstanceOf(WizardError);
		expect(err.name).toBe("WizardStepLoadError");
		expect(err.message).toBe('Failed to load step "documents"');
		expect(err.stepId).toBe("documents");
		expect(err.cause).toBe(cause);
	});

	it("leaves cause undefined when none is given", () => {
		expect(new WizardStepLoadError("x").cause).toBeUndefined();
	});
});
