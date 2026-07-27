import type { WizardSerializedState } from "@gooonzick/wizard-core";
import { WizardRestoreError } from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import type { CreateWizardStoreOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore(
	overrides: Partial<CreateWizardStoreOptions<SignupData>> = {},
) {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...overrides,
	});
}

describe("actions", () => {
	it("A1: updateField updates data and emits", () => {
		const wizard = makeStore();
		const seen = vi.fn();
		const unsubscribe = wizard.subscribe(seen);

		wizard.actions.updateField("name", "ada");

		expect(get(wizard).data.name).toBe("ada");
		expect(seen.mock.calls.length).toBeGreaterThan(1);
		unsubscribe();
	});

	it("A2: updateField reports the authoritative changedFields=[field]", () => {
		const onDataChange = vi.fn();
		const wizard = makeStore({ onDataChange });

		wizard.actions.updateField("name", "ada");

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});

	it("A3: updateField with an identical value is a no-op", () => {
		const onDataChange = vi.fn();
		const wizard = makeStore({ onDataChange });
		const seen = vi.fn();
		const unsubscribe = wizard.subscribe(seen);
		const emissions = seen.mock.calls.length;

		wizard.actions.updateField("name", initialData.name);

		expect(onDataChange).not.toHaveBeenCalled();
		expect(seen.mock.calls.length).toBe(emissions);
		unsubscribe();
	});

	it("A4: updateData emits and diffs the changed field", () => {
		const onDataChange = vi.fn();
		const wizard = makeStore({ onDataChange });

		wizard.actions.updateData((d) => ({ ...d, email: "x@y.z" }));

		expect(get(wizard).data.email).toBe("x@y.z");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["email"]);
	});

	it("A5: setData replaces data and deep-clones the argument", () => {
		const wizard = makeStore();
		const next: SignupData = { name: "ada", email: "a@b.c", plan: "pro" };

		wizard.actions.setData(next);
		next.name = "mutated";

		expect(get(wizard).data.name).toBe("ada");
		expect(get(wizard).data.plan).toBe("pro");
	});

	it("A6: validate toggles isValidating and updates the validation slice", async () => {
		const wizard = makeStore();
		const loading: boolean[] = [];
		const unsubscribe = wizard.loading.subscribe((v) =>
			loading.push(v.isValidating),
		);

		await wizard.actions.validate();
		unsubscribe();

		expect(loading).toContain(true);
		expect(loading.at(-1)).toBe(false);

		const validation = get(wizard.validation);
		expect(validation.isValid).toBe(false);
		expect(validation.validationErrors?.name).toBe("Name is required");
	});

	it("A7: validateAll returns a summary and can persist step statuses", async () => {
		const wizard = makeStore();

		const summary = await wizard.actions.validateAll({ updateStatuses: true });

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["personal"]);
		expect(summary.firstInvalidStepId).toBe("personal");
		expect(get(wizard).stepStatuses.personal).toBe("error");
	});

	it("A8: canSubmit/submit complete the wizard on the last step", async () => {
		const onComplete = vi.fn();
		const wizard = makeStore({ onComplete });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await wizard.goNext();
		expect(get(wizard).currentStepId).toBe("summary");

		await expect(wizard.actions.canSubmit()).resolves.toBe(true);

		const submitting: boolean[] = [];
		const unsubscribe = wizard.loading.subscribe((v) =>
			submitting.push(v.isSubmitting),
		);
		await wizard.actions.submit();
		unsubscribe();

		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(get(wizard).isCompleted).toBe(true);
		expect(submitting).toContain(true);
		expect(submitting.at(-1)).toBe(false);
	});

	it("A9: serialize/restore round-trip (restore emits twice)", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		const serialized = wizard.actions.serialize();
		wizard.actions.reset();
		await flush();
		expect(get(wizard).currentStepId).toBe("personal");

		wizard.actions.restore(serialized);
		// restore() emits synchronously and then again from its fire-and-forget
		// validate() — two flushes before asserting the settled state (§9.5).
		await flush();
		await flush();

		expect(get(wizard).currentStepId).toBe("plan");
		expect(get(wizard).data.name).toBe("ada");
	});

	it("A10: restoring a malformed snapshot surfaces WizardRestoreError", async () => {
		const onError = vi.fn();
		const wizard = makeStore({ onError });

		wizard.actions.restore({
			version: -1,
		} as unknown as WizardSerializedState<SignupData>);
		await flush();

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
	});

	it("A11: reset returns to the initial step and data", async () => {
		const onReset = vi.fn();
		const wizard = makeStore({ onReset });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		wizard.actions.reset();
		await flush();

		const value = get(wizard);
		expect(value.currentStepId).toBe("personal");
		expect(value.data).toEqual(initialData);
		expect(onReset).toHaveBeenCalledTimes(1);
		expect(get(wizard.loading)).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		});
	});

	it("A12: cancel calls onCancel and then resets", async () => {
		const onCancel = vi.fn();
		const wizard = makeStore({ onCancel });
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		await wizard.actions.cancel();
		await flush();

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(get(wizard).currentStepId).toBe("personal");
		expect(get(wizard).data).toEqual(initialData);
	});
});
