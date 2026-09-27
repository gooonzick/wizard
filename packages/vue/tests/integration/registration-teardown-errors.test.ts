import {
	createAnalyticsPlugin,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { settle } from "./fixtures/async-helpers";
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

describe.each(VARIANTS)("RegistrationWizard teardown (%s)", (variant) => {
	it("unmount tears the machine down: plugin destroy runs exactly once", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<RegistrationData>[] = [
			{ name: "teardown-spy", destroy },
		];
		const mounted = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			plugins,
		});
		await mounted.fillPersonal();
		await mounted.click("next");
		expect(destroy).not.toHaveBeenCalled();

		mounted.wrapper.unmount();
		await settle();

		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("analytics reports a drop-off on the step the user abandoned", async () => {
		let clock = 1_000;
		const onDropOff = vi.fn();
		const onStepComplete = vi.fn();
		const analytics = createAnalyticsPlugin<RegistrationData>({
			now: () => clock,
			onDropOff,
			onStepComplete,
		});
		const mounted = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			plugins: [analytics],
		});

		await mounted.fillPersonal();
		clock = 1_500;
		await mounted.click("next");
		expect(mounted.currentStep()).toBe("account");
		expect(onStepComplete).toHaveBeenCalledWith("personal", 500);

		clock = 4_000;
		mounted.wrapper.unmount();
		await settle();

		expect(onDropOff).toHaveBeenCalledTimes(1);
		expect(onDropOff).toHaveBeenCalledWith("account", 2_500);
	});

	it("analytics does not report a drop-off after completion", async () => {
		const onDropOff = vi.fn();
		const onWizardComplete = vi.fn();
		const analytics = createAnalyticsPlugin<RegistrationData>({
			now: () => 0,
			onDropOff,
			onWizardComplete,
		});
		const mounted = await mountRegistration(variant, {
			definition: createRegistrationDefinition(),
			plugins: [analytics],
		});

		await mounted.fillPersonal();
		await mounted.click("next");
		await mounted.chooseAccount("personal");
		await mounted.click("next");
		await mounted.setAgree(true);
		await mounted.click("next");
		expect(mounted.isComplete()).toBe(true);
		await settle();
		expect(onWizardComplete).toHaveBeenCalledTimes(1);

		mounted.wrapper.unmount();
		await settle();
		expect(onDropOff).not.toHaveBeenCalled();
	});
});

describe.each(
	VARIANTS,
)("RegistrationWizard error surfacing (%s)", (variant) => {
	it("a throwing enabled guard reaches onError and the error area without crashing the app", async () => {
		const guardError = new Error("company guard exploded");
		const onError = vi.fn();
		page = await mountRegistration(variant, {
			definition: createRegistrationDefinition({
				companyEnabled: (data) => {
					if (data.accountType === "business") {
						throw guardError;
					}
					return false;
				},
			}),
			onError,
		});

		await page.fillPersonal();
		await page.click("next");
		expect(page.currentStep()).toBe("account");
		expect(onError).not.toHaveBeenCalled();

		// Selecting "business" makes the background navigation recompute
		// evaluate the throwing guard.
		await page.chooseAccount("business");
		expect(onError).toHaveBeenCalledWith(guardError);

		await page.click("next");
		expect(page.currentStep()).toBe("account");
		expect(page.errorMessages()).toEqual(["company guard exploded"]);
		expect(page.isDisabled("next")).toBe(false);
		for (const [error] of onError.mock.calls) {
			expect(error).toBe(guardError);
		}

		// The app is still usable: pick the other branch and carry on.
		await page.chooseAccount("personal");
		await page.click("next");
		expect(page.currentStep()).toBe("review");
		expect(page.errorMessages()).toEqual([]);
		await page.click("back");
		expect(page.currentStep()).toBe("account");
	});

	it("a throwing onEnter keeps the committed step rendered and reports the error", async () => {
		const enterError = new Error("review onEnter failed");
		const definition = createRegistrationDefinition();
		definition.steps.review = {
			...definition.steps.review,
			onEnter: () => {
				throw enterError;
			},
		};
		const onError = vi.fn();
		const onStepEnter = vi.fn();
		page = await mountRegistration(variant, {
			definition,
			onError,
			onStepEnter,
		});

		await page.fillPersonal();
		await page.click("next");
		await page.chooseAccount("personal");
		await page.click("next");

		expect(page.currentStep()).toBe("review");
		expect(page.errorMessages()).toEqual(["review onEnter failed"]);
		expect(onError).toHaveBeenCalledWith(enterError);
		expect(onStepEnter).not.toHaveBeenCalledWith("review", expect.anything());
		expect(page.isDisabled("next")).toBe(false);
	});
});
