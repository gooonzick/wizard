import {
	WizardRestoreError,
	type WizardSerializedState,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(options: Partial<CreateWizardOptions<SignupData>> = {}) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("actions", () => {
	it("A1: updateData applies an updater", async () => {
		const wizard = makeWizard();
		await flush();

		wizard.actions.updateData((d) => ({ ...d, email: "a@b.c" }));

		expect(wizard.data.email).toBe("a@b.c");
	});

	it("A2: setData replaces the data", async () => {
		const wizard = makeWizard();
		await flush();

		wizard.actions.setData({ name: "ada", email: "a@b.c", plan: "pro" });

		expect(wizard.data).toEqual({ name: "ada", email: "a@b.c", plan: "pro" });
	});

	it("A3: validate toggles isValidating and exposes errors", async () => {
		const wizard = makeWizard();
		await flush();

		const pending = wizard.actions.validate();
		expect(wizard.isValidating).toBe(true);
		await pending;

		expect(wizard.isValidating).toBe(false);
		expect(wizard.isValid).toBe(false);
		expect(wizard.validationErrors?.name).toBe("Name is required");
	});

	it("A4: validateAll returns a summary and can persist step statuses", async () => {
		const wizard = makeWizard();
		await flush();

		const summary = await wizard.actions.validateAll({ updateStatuses: true });

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["personal"]);
		expect(wizard.stepStatuses.personal).toBe("error");
		expect(wizard.isValidating).toBe(false);
	});

	it("A5: canSubmit is true only on a valid LAST step", async () => {
		const wizard = makeWizard();
		await flush();

		expect(await wizard.actions.canSubmit()).toBe(false);
		wizard.actions.updateField("name", "ada");
		// Valid, but not the last step: machine.canSubmit() = valid && !nextStep.
		expect(await wizard.actions.canSubmit()).toBe(false);

		await wizard.goNext();
		await wizard.goNext();
		expect(wizard.currentStepId).toBe("summary");
		expect(await wizard.actions.canSubmit()).toBe(true);
	});

	it("A6: submit toggles isSubmitting and completes on the last step", async () => {
		const onComplete = vi.fn();
		const wizard = makeWizard({ onComplete });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await wizard.goNext();

		const pending = wizard.actions.submit();
		expect(wizard.isSubmitting).toBe(true);
		await pending;

		expect(wizard.isSubmitting).toBe(false);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(wizard.isCompleted).toBe(true);
	});

	it("A7: serialize + restore round-trips the position and data", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		const serialized = wizard.actions.serialize();

		wizard.actions.reset();
		await flush();
		expect(wizard.currentStepId).toBe("personal");

		wizard.actions.restore(serialized);
		// restore() emits synchronously and again from its fire-and-forget validate().
		await flush();
		await flush();

		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.data.name).toBe("ada");
	});

	it("A8: restoring a malformed snapshot goes to onError, not an unhandled rejection", async () => {
		const onError = vi.fn();
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			const wizard = makeWizard({ onError });

			wizard.actions.restore({
				version: -1,
			} as unknown as WizardSerializedState<SignupData>);
			await flush();

			expect(onError).toHaveBeenCalledTimes(1);
			expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});

	it("A9: reset returns to the initial step and data with idle loading flags", async () => {
		const onReset = vi.fn();
		const wizard = makeWizard({ onReset });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		wizard.actions.reset();
		await flush();

		expect(onReset).toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data).toEqual(initialData);
		expect(wizard.loading).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
			isLoadingStep: false,
		});
	});

	it("A9b: reset(X) makes X the baseline for a later bare reset()", async () => {
		const wizard = makeWizard();
		await flush();
		const baseline: SignupData = {
			name: "grace",
			email: "g@h.io",
			plan: "pro",
		};

		wizard.actions.reset(baseline);
		await flush();
		expect(wizard.data).toEqual(baseline);

		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		wizard.actions.reset();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data).toEqual(baseline);
		expect(wizard.data).not.toEqual(initialData);
	});

	it("A10: cancel calls onCancel and then resets", async () => {
		const onCancel = vi.fn();
		const wizard = makeWizard({ onCancel });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		await wizard.actions.cancel();
		await flush();

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data.name).toBe("");
	});
});
