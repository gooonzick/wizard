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

const FLAT_KEYS = [
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
] as const;

describe("createWizard", () => {
	it("C1: exposes the initial state", async () => {
		const wizard = makeWizard();
		await flush();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.data).toEqual(initialData);
		expect(wizard.isFirstStep).toBe(true);
		expect(wizard.isCompleted).toBe(false);
		expect(wizard.isNavigating).toBe(false);
		expect(wizard.isDestroyed).toBe(false);
	});

	it("C2: canGoNext is false initially and true after the async navigation compute", async () => {
		const wizard = makeWizard();

		expect(wizard.canGoNext).toBe(false);
		await flush();
		expect(wizard.canGoNext).toBe(true);
	});

	it("C3: slice getters return the manager's cached snapshots", async () => {
		const wizard = makeWizard();
		await flush();
		const manager = wizard.getManager();

		expect(wizard.state).toBe(manager.getStateSnapshot());
		expect(wizard.validation).toBe(manager.getValidationSnapshot());
		expect(wizard.navigation).toBe(manager.getNavigationSnapshot());
		expect(wizard.loading).toBe(manager.getLoadingSnapshot());
	});

	it("C4: every flat getter equals the matching slice field", async () => {
		const wizard = makeWizard();
		await flush();
		const merged: Record<string, unknown> = {
			...wizard.state,
			...wizard.validation,
			...wizard.navigation,
			...wizard.loading,
		};

		for (const key of FLAT_KEYS) {
			expect(key in wizard).toBe(true);
			expect(wizard[key]).toBe(merged[key]);
		}
	});

	it("C5: goNext / goPrevious / goTo move the current step", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goNext();
		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.stepHistory).toEqual(["personal", "plan"]);

		await wizard.goPrevious();
		expect(wizard.currentStepId).toBe("personal");

		await wizard.goTo("summary");
		expect(wizard.currentStepId).toBe("summary");
		expect(wizard.isLastStep).toBe(true);
	});

	it("C6: an invalid step blocks goNext and exposes validationErrors", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();

		await expect(wizard.goNext()).rejects.toThrow();

		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.isValid).toBe(false);
		expect(wizard.validationErrors?.name).toBe("Name is required");
		expect(onError).toHaveBeenCalled();
	});

	it("C7: isNavigating is true while a transition is in flight", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		const pending = wizard.goNext();
		expect(wizard.isNavigating).toBe(true);
		await pending;
		expect(wizard.isNavigating).toBe(false);
	});

	it("C8: callbacks are forwarded", async () => {
		const onStateChange = vi.fn();
		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();
		const onComplete = vi.fn();
		const onDataChange = vi.fn();
		const wizard = makeWizard({
			onStateChange,
			onStepEnter,
			onStepLeave,
			onComplete,
			onDataChange,
		});
		await flush();
		expect(onStepEnter).toHaveBeenCalledWith("personal", expect.anything());

		wizard.actions.updateField("name", "ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onStateChange).toHaveBeenCalled();

		await wizard.goNext();
		expect(onStepLeave).toHaveBeenCalledWith("personal", expect.anything());
		expect(onStepEnter).toHaveBeenCalledWith("plan", expect.anything());

		await wizard.goNext();
		await wizard.actions.submit();
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(wizard.isCompleted).toBe(true);
	});

	it("C9: goToStep skips validation (deprecated alias)", async () => {
		const wizard = makeWizard();
		await flush();

		await wizard.goToStep("plan");
		expect(wizard.currentStepId).toBe("plan");
	});
});
