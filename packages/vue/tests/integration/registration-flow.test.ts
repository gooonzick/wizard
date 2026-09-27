import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "./fixtures/async-helpers";
import {
	createRegistrationDefinition,
	type RegistrationData,
} from "./fixtures/registration-definition";
import {
	mountRegistration,
	type RegistrationPage,
	VARIANTS,
} from "./fixtures/registration-ui";

let page: RegistrationPage | undefined;

afterEach(() => {
	page?.wrapper.unmount();
	page = undefined;
});

describe.each(VARIANTS)("RegistrationWizard flow (%s)", (variant) => {
	it("happy path (personal): fills every step, finishes and shows the completion screen", async () => {
		const definitionOnComplete = vi.fn();
		const onComplete = vi.fn();
		const onStepEnter = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition({
				onComplete: definitionOnComplete,
			}),
			onComplete,
			onStepEnter,
		});

		expect(page.currentStep()).toBe("personal");
		expect(page.status("personal")).toBe("active");
		// accountType is still unset, so the company guard is false: the step is
		// skipped from the start and excluded from progress (3 enabled steps).
		expect(page.status("company")).toBe("skipped");
		expect(page.progress()).toBe(0);
		expect(page.isDisabled("back")).toBe(true);
		expect(page.nextLabel()).toBe("Next");

		await page.fillPersonal("Ada", "ada@example.com");
		await page.click("next");
		expect(page.currentStep()).toBe("account");
		expect(page.status("personal")).toBe("completed");
		expect(page.isDisabled("back")).toBe(false);
		expect(page.progress()).toBe(33);

		await page.chooseAccount("personal");
		await page.click("next");
		expect(page.currentStep()).toBe("review");
		expect(page.status("company")).toBe("skipped");
		expect(page.progress()).toBe(67);
		expect(page.nextLabel()).toBe("Finish");

		await page.setAgree(true);
		await page.click("next");

		const finalData: RegistrationData = {
			name: "Ada",
			email: "ada@example.com",
			accountType: "personal",
			company: "",
			agree: true,
		};
		expect(page.isComplete()).toBe(true);
		expect(page.completionText()).toBe("Welcome, Ada!");
		expect(page.currentStep()).toBeNull();
		expect(definitionOnComplete).toHaveBeenCalledTimes(1);
		expect(definitionOnComplete).toHaveBeenCalledWith(finalData);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(finalData);

		// The company step was never entered nor rendered; it stays "skipped"
		// and the final step is marked completed, so progress reaches 100%.
		const entered = onStepEnter.mock.calls.map(([stepId]) => stepId);
		expect(entered).not.toContain("company");
		expect(page.statuses()).toEqual({
			personal: "completed",
			account: "completed",
			company: "skipped",
			review: "completed",
		});
		expect(page.progress()).toBe(100);
		expect(page.errorMessages()).toEqual([]);
	});

	it("business branch: shows the company step, locks Next while its onSubmit is pending, then reaches review", async () => {
		const submitGate = deferred();
		const companyOnSubmit = vi.fn(() => submitGate.promise);
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition({ companyOnSubmit }),
		});

		await page.fillPersonal();
		await page.click("next");
		await page.chooseAccount("business");
		await page.click("next");
		expect(page.currentStep()).toBe("company");
		expect(page.status("company")).toBe("active");

		await page.type("company", "Acme");
		await page.click("next");

		// onSubmit is pending: still on company, Next and Back are locked.
		expect(companyOnSubmit).toHaveBeenCalledTimes(1);
		expect(companyOnSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ company: "Acme", accountType: "business" }),
			expect.anything(),
		);
		expect(page.currentStep()).toBe("company");
		expect(page.isDisabled("next")).toBe(true);
		expect(page.isDisabled("back")).toBe(true);

		submitGate.resolve();
		await flushPromises();

		expect(page.currentStep()).toBe("review");
		expect(page.status("company")).toBe("completed");
		expect(page.isDisabled("next")).toBe(false);
		expect(page.isDisabled("back")).toBe(false);
		expect(page.nextLabel()).toBe("Finish");
		expect(page.wrapper.find('[data-testid="summary"]').text()).toContain(
			"@ Acme",
		);
	});

	it("validation UX: empty Next shows field errors and an error status; fixing the fields clears them", async () => {
		const onError = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			onError,
		});

		await page.click("next");
		expect(page.currentStep()).toBe("personal");
		expect(page.fieldError("name")).toBe("Name is required");
		expect(page.fieldError("email")).toBe("Email is required");
		expect(page.status("personal")).toBe("error");
		// Validation failures are shown inline, not in the global error area.
		expect(page.errorMessages()).toEqual([]);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ name: "WizardValidationError" }),
		);

		await page.type("name", "Ada");
		await page.type("email", "ada");
		await page.click("next");
		expect(page.currentStep()).toBe("personal");
		expect(page.fieldError("name")).toBeNull();
		expect(page.fieldError("email")).toBe("Email must contain @");
		expect(page.status("personal")).toBe("error");

		await page.type("email", "ada@example.com");
		await page.click("next");
		expect(page.currentStep()).toBe("account");
		expect(page.fieldError("name")).toBeNull();
		expect(page.fieldError("email")).toBeNull();
		expect(page.status("personal")).toBe("completed");
		expect(page.status("account")).toBe("active");
	});

	it("back navigation: history-based Back re-routes around the company step and progress never decreases on Back", async () => {
		const onStepEnter = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			onStepEnter,
		});
		let progressBeforeBack = -1;
		const clickBack = async () => {
			progressBeforeBack = page?.progress() ?? -1;
			await page?.click("back");
			expect(page?.progress()).toBeGreaterThanOrEqual(progressBeforeBack);
		};

		expect(page.isDisabled("back")).toBe(true);

		await page.fillPersonal();
		await page.click("next");
		await page.chooseAccount("business");
		await page.click("next");
		await page.type("company", "Acme");
		await page.click("next");
		expect(page.currentStep()).toBe("review");
		// Business path: all 4 steps enabled, 3 completed.
		expect(page.status("company")).toBe("completed");
		expect(page.progress()).toBe(75);

		// Back walks the history: review -> company -> account.
		await clickBack();
		expect(page.currentStep()).toBe("company");
		expect(page.inputValue("company")).toBe("Acme");
		await clickBack();
		expect(page.currentStep()).toBe("account");
		expect(page.progress()).toBe(75);

		// Switch to personal: Next goes straight to review.
		const entriesBeforeSwitch = onStepEnter.mock.calls.length;
		await page.chooseAccount("personal");
		await page.click("next");
		expect(page.currentStep()).toBe("review");
		expect(
			onStepEnter.mock.calls.slice(entriesBeforeSwitch).map(([id]) => id),
		).toEqual(["review"]);
		// Switching branch (a forward navigation) re-evaluates the company guard:
		// the previously completed company step is now skipped and no longer
		// counts, so progress is 2 of 3 enabled steps.
		expect(page.status("company")).toBe("skipped");
		expect(page.progress()).toBe(67);

		// review.previous("company") is deliberately wrong for this path:
		// history-based Back must land on account, skipping the now-disabled
		// company step.
		await clickBack();
		expect(page.currentStep()).toBe("account");
		await clickBack();
		expect(page.currentStep()).toBe("personal");
		expect(page.inputValue("name")).toBe("Ada");
		expect(page.isDisabled("back")).toBe(true);
		// Back never un-skips the company step nor loses completed steps.
		expect(page.status("company")).toBe("skipped");
		expect(page.progress()).toBe(67);
		expect(page.errorMessages()).toEqual([]);
	});

	it("definition.onComplete failure: stays on review with an error, and Finish again completes", async () => {
		const serverError = new Error("Server unavailable");
		const definitionOnComplete = vi
			.fn<(data: RegistrationData) => Promise<void>>()
			.mockRejectedValueOnce(serverError)
			.mockResolvedValue(undefined);
		const onComplete = vi.fn();
		const onError = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition({
				onComplete: definitionOnComplete,
			}),
			onComplete,
			onError,
		});

		await page.fillPersonal();
		await page.click("next");
		await page.chooseAccount("personal");
		await page.click("next");
		await page.setAgree(true);
		await page.click("next");

		expect(page.isComplete()).toBe(false);
		expect(page.currentStep()).toBe("review");
		expect(page.errorMessages()).toEqual(["Server unavailable"]);
		expect(onError).toHaveBeenCalledWith(serverError);
		expect(onComplete).not.toHaveBeenCalled();
		expect(page.isDisabled("next")).toBe(false);
		expect(page.nextLabel()).toBe("Finish");

		await page.click("next");
		expect(page.isComplete()).toBe(true);
		expect(page.errorMessages()).toEqual([]);
		expect(definitionOnComplete).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
