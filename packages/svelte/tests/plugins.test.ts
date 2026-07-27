import type { TransitionEvent, WizardPlugin } from "@gooonzick/wizard-core";
import { WizardConfigurationError } from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore(plugins?: WizardPlugin<SignupData>[]) {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		plugins,
	});
}

describe("plugins", () => {
	it("P1: onInit is dispatched exactly once", async () => {
		const onInit = vi.fn();
		makeStore([{ name: "p", onInit }]);

		await flush();

		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("P2: destroy() tears plugins down exactly once", async () => {
		const destroy = vi.fn();
		const wizard = makeStore([{ name: "p", destroy }]);

		await wizard.destroy();
		await wizard.destroy();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("P3: a vetoing beforeTransition leaves every visible slice untouched", async () => {
		const wizard = makeStore([{ name: "veto", beforeTransition: () => false }]);
		await flush();
		wizard.actions.updateField("name", "ada");

		const before = get(wizard);
		const historyBefore = [...before.stepHistory];
		const visitedBefore = [...before.visitedSteps];
		const statusesBefore = { ...before.stepStatuses };

		await wizard.goNext();
		await flush();

		const after = get(wizard);
		expect(after.currentStepId).toBe("personal");
		expect(after.stepHistory).toEqual(historyBefore);
		expect(after.visitedSteps).toEqual(visitedBefore);
		expect(after.stepStatuses).toEqual(statusesBefore);
	});

	it("P4: afterTransition receives the committed transition", async () => {
		const afterTransition = vi.fn<(e: TransitionEvent<SignupData>) => void>();
		const wizard = makeStore([{ name: "after", afterTransition }]);
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

	it("P5: duplicate plugin names throw from createWizardStore", () => {
		expect(() => makeStore([{ name: "dup" }, { name: "dup" }])).toThrow(
			WizardConfigurationError,
		);
	});
});
