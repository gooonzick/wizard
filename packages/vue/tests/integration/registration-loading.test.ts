import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Deferred, deferred } from "./fixtures/async-helpers";
import { createRegistrationDefinition } from "./fixtures/registration-definition";
import {
	mountRegistration,
	type RegistrationPage,
	VARIANTS,
	type Variant,
} from "./fixtures/registration-ui";

let page: RegistrationPage | undefined;

afterEach(() => {
	page?.wrapper.unmount();
	page = undefined;
});

async function mountOnCompanyStep(variant: Variant) {
	const gates: Deferred<void>[] = [];
	const companyOnSubmit = vi.fn(() => {
		const gate = deferred();
		gates.push(gate);
		return gate.promise;
	});
	const onStepEnter = vi.fn();
	const onError = vi.fn();
	const mounted = await mountRegistration(variant, {
		definition: createRegistrationDefinition({ companyOnSubmit }),
		onStepEnter,
		onError,
	});
	await mounted.fillPersonal();
	await mounted.click("next");
	await mounted.chooseAccount("business");
	await mounted.click("next");
	await mounted.type("company", "Acme");
	expect(mounted.currentStep()).toBe("company");
	return { page: mounted, gates, companyOnSubmit, onStepEnter, onError };
}

describe.each(VARIANTS)("RegistrationWizard loading (%s)", (variant) => {
	it("double click on Next while onSubmit is pending navigates exactly once", async () => {
		const ctx = await mountOnCompanyStep(variant);
		page = ctx.page;
		const next = page.button("next");

		// Two synchronous clicks: the DOM `disabled` attribute only lands on the
		// next render, so the second click really reaches the handler.
		void next.trigger("click");
		void next.trigger("click");
		await flushPromises();

		expect(ctx.companyOnSubmit).toHaveBeenCalledTimes(1);
		// The busy-rejected second click must not clear the flag held by the
		// first (reference-counted loading): Next stays disabled.
		expect(page.isDisabled("next")).toBe(true);
		expect(page.isDisabled("back")).toBe(true);
		expect(page.currentStep()).toBe("company");
		// A busy rejection is not surfaced to the user nor routed to onError.
		expect(page.errorMessages()).toEqual([]);
		expect(ctx.onError).not.toHaveBeenCalled();

		// A third click on the (now disabled) button is ignored by the DOM.
		await page.click("next");
		expect(ctx.companyOnSubmit).toHaveBeenCalledTimes(1);

		ctx.gates[0].resolve();
		await flushPromises();

		expect(page.currentStep()).toBe("review");
		expect(page.isDisabled("next")).toBe(false);
		const reviewEntries = ctx.onStepEnter.mock.calls.filter(
			([stepId]) => stepId === "review",
		);
		expect(reviewEntries).toHaveLength(1);
		expect(ctx.gates).toHaveLength(1);
	});

	it("a rejected onSubmit unlocks Next, shows the error and allows a retry", async () => {
		const ctx = await mountOnCompanyStep(variant);
		page = ctx.page;

		await page.click("next");
		expect(page.isDisabled("next")).toBe(true);

		const failure = new Error("Company lookup failed");
		ctx.gates[0].reject(failure);
		await flushPromises();

		expect(page.currentStep()).toBe("company");
		expect(page.isDisabled("next")).toBe(false);
		expect(page.errorMessages()).toEqual(["Company lookup failed"]);
		expect(ctx.onError).toHaveBeenCalledWith(failure);

		await page.click("next");
		expect(page.errorMessages()).toEqual([]);
		expect(page.isDisabled("next")).toBe(true);
		ctx.gates[1].resolve();
		await flushPromises();
		expect(page.currentStep()).toBe("review");
		expect(ctx.companyOnSubmit).toHaveBeenCalledTimes(2);
	});
});
