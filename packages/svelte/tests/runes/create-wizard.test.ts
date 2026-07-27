import type { WizardPlugin } from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../../src/create-wizard-store";
import { createWizard } from "../../src/runes/create-wizard.svelte";
import { flush } from "../helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "../helpers/wizard";

function makeWizard(
	options: {
		plugins?: WizardPlugin<SignupData>[];
		onDataChange?: (
			prev: SignupData,
			next: SignupData,
			changed: (keyof SignupData)[],
		) => void;
	} = {},
) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("createWizard (runes)", () => {
	it("R1: flat getters reflect navigation", async () => {
		const wizard = makeWizard();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.stepHistory).toEqual(["personal", "plan"]);
	});

	it("R2: canGoNext is false initially and true after a flush", async () => {
		const wizard = makeWizard();

		expect(wizard.canGoNext).toBe(false);
		await flush();
		expect(wizard.canGoNext).toBe(true);
	});

	it("R3: field() get/set, no-op guard and reference stability", () => {
		const onDataChange = vi.fn();
		const wizard = makeWizard({ onDataChange });
		const name = wizard.field("name");

		expect(name).toBe(wizard.field("name"));
		expect(name.value).toBe("");

		name.value = "ada";
		expect(name.value).toBe("ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);

		name.value = "ada";
		expect(onDataChange).toHaveBeenCalledTimes(1);
	});

	it("R4: slice getters return the manager's snapshots", async () => {
		const wizard = makeWizard();
		await flush();
		const manager = wizard.getManager();

		expect(wizard.state).toBe(manager.getStateSnapshot());
		expect(wizard.validation).toBe(manager.getValidationSnapshot());
		expect(wizard.navigation).toBe(manager.getNavigationSnapshot());
		expect(wizard.loading).toBe(manager.getLoadingSnapshot());
	});

	it("R5: destroy() tears plugins down and creation outside a component is safe", async () => {
		const destroy = vi.fn();
		let wizard!: ReturnType<typeof makeWizard>;
		expect(() => {
			wizard = makeWizard({ plugins: [{ name: "p", destroy }] });
		}).not.toThrow();

		await wizard.destroy();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(wizard.isDestroyed).toBe(true);
	});

	it("R6: the runes flat key set matches the store aggregate", async () => {
		const store = createWizardStore<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		const wizard = makeWizard();
		await flush();

		const expected = Object.keys(get(store)).sort();
		const runesKeys = [
			"currentStepId",
			"currentStep",
			"data",
			"isCompleted",
			"stepStatuses",
			"progress",
			"isValid",
			"validationErrors",
			"canGoNext",
			"canGoPrevious",
			"canGoBack",
			"isFirstStep",
			"isLastStep",
			"visitedSteps",
			"availableSteps",
			"stepHistory",
			"isValidating",
			"isSubmitting",
			"isNavigating",
		].sort();

		expect(runesKeys).toEqual(expected);
		// Every advertised key must actually be readable on the runes wizard.
		for (const key of runesKeys) {
			expect(key in wizard).toBe(true);
		}
	});
});
