import type { WizardDefinition } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
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

describe("lifecycle hooks", () => {
	it("L1: every callback fires at the right time", async () => {
		const onStateChange = vi.fn();
		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();
		const onComplete = vi.fn();
		const onCancel = vi.fn();
		const onReset = vi.fn();
		const onError = vi.fn();
		const onDataChange = vi.fn();

		const wizard = createWizardStore<SignupData>({
			definition: createTestDefinition(),
			initialData,
			onStateChange,
			onStepEnter,
			onStepLeave,
			onComplete,
			onCancel,
			onReset,
			onError,
			onDataChange,
		});
		await flush();

		expect(onStepEnter).toHaveBeenCalledWith("personal", expect.anything());

		// A failing validation reports through onError.
		await expect(wizard.goNext()).rejects.toThrow();
		expect(onError).toHaveBeenCalled();

		wizard.actions.updateField("name", "ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onStateChange).toHaveBeenCalled();

		await wizard.goNext();
		expect(onStepLeave).toHaveBeenCalledWith("personal", expect.anything());
		expect(onStepEnter).toHaveBeenCalledWith("plan", expect.anything());

		await wizard.goNext();
		await wizard.actions.submit();
		expect(onComplete).toHaveBeenCalledTimes(1);

		await wizard.actions.cancel();
		await flush();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onReset).toHaveBeenCalled();
		expect(get(wizard).currentStepId).toBe("personal");
	});

	it("L2: an async onEnter on the initial step does not break construction", async () => {
		const onStateChange = vi.fn();
		const definition: WizardDefinition<SignupData> =
			createLinearWizard<SignupData>({
				id: "async-enter",
				steps: [{ id: "personal" }, { id: "plan" }],
			});
		definition.steps.personal.onEnter = async () => {
			await new Promise((r) => setTimeout(r, 0));
		};

		const wizard = createWizardStore<SignupData>({
			definition,
			initialData,
			onStateChange,
		});

		expect(get(wizard).currentStepId).toBe("personal");
		await flush();
		await flush();

		expect(onStateChange).toHaveBeenCalled();
		expect(get(wizard).currentStepId).toBe("personal");
		expect(get(wizard).canGoNext).toBe(true);
	});

	it("L3: callbacks are captured at creation and are not reactive", async () => {
		const first = vi.fn();
		const later = vi.fn();
		const options: CreateWizardStoreOptions<SignupData> = {
			definition: createTestDefinition(),
			initialData,
			onDataChange: first,
		};

		const wizard = createWizardStore<SignupData>(options);
		options.onDataChange = later;

		wizard.actions.updateField("name", "ada");
		await flush();

		expect(first).toHaveBeenCalledTimes(1);
		expect(later).not.toHaveBeenCalled();
	});
});
