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

const initialData: RegistrationData = {
	name: "Initial",
	email: "initial@example.com",
	accountType: "",
	company: "",
	agree: false,
};

const preset: RegistrationData = {
	name: "Preset",
	email: "preset@example.com",
	accountType: "business",
	company: "Preset Co",
	agree: false,
};

// Fresh statuses after a reset/cancel to `initialData`: the first step is
// active and, because accountType is "" (company guard false), the company
// step is re-marked "skipped" by the post-reset refresh; the rest are pristine.
const FRESH_STATUSES = {
	personal: "active",
	account: "pristine",
	company: "skipped",
	review: "pristine",
};

// Fresh statuses after a reset to `preset` (accountType "business"): the
// company guard is true, so nothing is skipped.
const FRESH_STATUSES_BUSINESS = {
	personal: "active",
	account: "pristine",
	company: "pristine",
	review: "pristine",
};

describe.each(VARIANTS)("RegistrationWizard reset & cancel (%s)", (variant) => {
	it("Reset returns to the first step with the initial data and fresh statuses", async () => {
		const onStepEnter = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			initialData,
			onStepEnter,
		});
		expect(page.inputValue("name")).toBe("Initial");

		await page.type("name", "Changed");
		await page.click("next");
		await page.chooseAccount("business");
		await page.click("next");
		expect(page.currentStep()).toBe("company");
		expect(page.progress()).toBeGreaterThan(0);

		await page.click("reset");

		expect(page.currentStep()).toBe("personal");
		expect(page.inputValue("name")).toBe("Initial");
		expect(page.inputValue("email")).toBe("initial@example.com");
		expect(page.statuses()).toEqual(FRESH_STATUSES);
		expect(page.progress()).toBe(0);
		expect(page.isDisabled("back")).toBe(true);
		expect(page.nextLabel()).toBe("Next");
		// The initial step is re-entered after the reset.
		expect(onStepEnter).toHaveBeenLastCalledWith(
			"personal",
			expect.objectContaining({ name: "Initial" }),
		);

		// The account choice was reset too.
		await page.click("next");
		expect(page.isChecked("account-business")).toBe(false);
		expect(page.isChecked("account-personal")).toBe(false);
	});

	it("reset(preset) becomes the sticky baseline for a later argument-less Reset", async () => {
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			initialData,
			preset,
		});

		// Mounted with accountType "": company starts skipped.
		expect(page.status("company")).toBe("skipped");

		await page.click("reset-preset");
		expect(page.currentStep()).toBe("personal");
		expect(page.inputValue("name")).toBe("Preset");
		expect(page.inputValue("email")).toBe("preset@example.com");
		// The preset's business accountType turns the company guard true again,
		// so the post-reset refresh returns the step to "pristine".
		expect(page.statuses()).toEqual(FRESH_STATUSES_BUSINESS);

		await page.type("name", "Edited");
		await page.click("next");
		expect(page.currentStep()).toBe("account");
		expect(page.isChecked("account-business")).toBe(true);

		await page.click("reset");
		expect(page.currentStep()).toBe("personal");
		expect(page.inputValue("name")).toBe("Preset");
		expect(page.statuses()).toEqual(FRESH_STATUSES_BUSINESS);

		await page.click("next");
		expect(page.isChecked("account-business")).toBe(true);
	});

	it("Cancel awaits onCancel, then returns to the first step", async () => {
		const cancelGate = deferred();
		const onCancel = vi.fn(() => cancelGate.promise);
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			initialData,
			onCancel,
		});

		await page.type("name", "Changed");
		await page.click("next");
		await page.chooseAccount("personal");
		expect(page.currentStep()).toBe("account");

		await page.click("cancel");

		// onCancel is pending: still on account, navigation locked.
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCancel).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Changed", accountType: "personal" }),
		);
		expect(page.currentStep()).toBe("account");
		expect(page.isDisabled("next")).toBe(true);
		expect(page.isDisabled("back")).toBe(true);

		cancelGate.resolve();
		await flushPromises();

		expect(page.currentStep()).toBe("personal");
		expect(page.inputValue("name")).toBe("Initial");
		expect(page.statuses()).toEqual(FRESH_STATUSES);
		expect(page.isDisabled("next")).toBe(false);
		expect(page.isDisabled("back")).toBe(true);
		expect(page.errorMessages()).toEqual([]);
	});

	it("a rejecting onCancel still resets and surfaces the error", async () => {
		const cancelError = new Error("Could not notify server");
		const onCancel = vi.fn(() => Promise.reject(cancelError));
		const onError = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			initialData,
			onCancel,
			onError,
		});

		await page.click("next");
		expect(page.currentStep()).toBe("account");

		await page.click("cancel");

		expect(page.currentStep()).toBe("personal");
		expect(page.statuses()).toEqual(FRESH_STATUSES);
		expect(page.errorMessages()).toEqual(["Could not notify server"]);
		expect(onError).toHaveBeenCalledWith(cancelError);
		expect(page.isDisabled("next")).toBe(false);
	});
});
