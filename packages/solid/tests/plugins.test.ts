import {
	type TransitionEvent,
	WizardConfigurationError,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(plugins?: WizardPlugin<SignupData>[]) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		plugins,
	});
}

describe("plugins", () => {
	it("P1: onInit is dispatched exactly once", async () => {
		const onInit = vi.fn();
		makeWizard([{ name: "p", onInit }]);

		await flush();

		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("P2: a vetoing beforeTransition leaves every visible field untouched", async () => {
		const wizard = makeWizard([
			{ name: "veto", beforeTransition: () => false },
		]);
		await flush();
		wizard.actions.updateField("name", "ada");
		const historyBefore = [...wizard.stepHistory];
		const statusesBefore = { ...wizard.stepStatuses };

		await wizard.goNext();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.stepHistory).toEqual(historyBefore);
		expect(wizard.stepStatuses).toEqual(statusesBefore);
	});

	it("P3: afterTransition receives the committed transition", async () => {
		const afterTransition = vi.fn<(e: TransitionEvent<SignupData>) => void>();
		const wizard = makeWizard([{ name: "after", afterTransition }]);
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goNext();
		await flush();

		expect(afterTransition).toHaveBeenCalledTimes(1);
		const event = afterTransition.mock.calls[0][0];
		expect(event.type).toBe("next");
		expect(event.fromStepId).toBe("personal");
		expect(event.toStepId).toBe("plan");
	});

	it("P4: duplicate plugin names throw from createWizard", () => {
		expect(() => makeWizard([{ name: "dup" }, { name: "dup" }])).toThrow(
			WizardConfigurationError,
		);
	});
});
