import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { flush } from "../helpers/flush";
import { createDeferred } from "./fixtures/deferred";
import {
	alerts,
	backButton,
	button,
	choose,
	clickBackTo,
	clickNextTo,
	fillPersonal,
	findHeading,
	inputValue,
	nextButton,
	progressPercent,
	stepStatus,
	toggle,
	typeInto,
	waitUntilEnabled,
} from "./fixtures/dom";
import {
	createInitialData,
	createRegistrationDefinition,
	type RegistrationData,
	type RegistrationHooks,
} from "./fixtures/registration";
import {
	RegistrationWizard,
	type RegistrationWizardProps,
	VARIANTS,
	type Variant,
} from "./fixtures/registration-wizard";

function renderWizard(
	variant: Variant,
	hooks: RegistrationHooks = {},
	props: Partial<RegistrationWizardProps> = {},
) {
	return render(() => (
		<RegistrationWizard
			variant={variant}
			definition={createRegistrationDefinition(hooks)}
			{...props}
		/>
	));
}

/** personal -> account (business) -> company (filled). */
async function reachCompany(): Promise<void> {
	await findHeading("Personal");
	fillPersonal();
	await clickNextTo("Account");
	choose("Account type", "business");
	await clickNextTo("Company");
	typeInto("Company", "Acme");
}

/** personal -> account (personal) -> review. */
async function reachReviewViaPersonal(): Promise<void> {
	await findHeading("Personal");
	fillPersonal();
	await clickNextTo("Account");
	choose("Account type", "personal");
	await clickNextTo("Review");
}

describe.each(VARIANTS)("registration wizard (%s)", (variant) => {
	it("1: happy path (personal) completes once with the final data and never renders company", async () => {
		const definitionOnComplete = vi.fn();
		const onComplete = vi.fn();
		const onStepRender = vi.fn();
		renderWizard(
			variant,
			{ onComplete: definitionOnComplete },
			{ onComplete, onStepRender },
		);

		await reachReviewViaPersonal();
		expect(nextButton().textContent).toBe("Finish");
		expect(screen.getByTestId("summary-name").textContent).toBe("Ada");

		toggle("I agree to the terms");
		fireEvent.click(nextButton());
		await findHeading("Registration complete");

		const finalData: RegistrationData = {
			name: "Ada",
			email: "ada@example.com",
			accountType: "personal",
			company: "",
			agree: true,
		};
		expect(screen.getByTestId("welcome").textContent).toBe("Welcome, Ada");
		expect(definitionOnComplete).toHaveBeenCalledTimes(1);
		expect(definitionOnComplete).toHaveBeenCalledWith(finalData);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(finalData);
		expect(onStepRender).not.toHaveBeenCalledWith("company");
		expect(screen.queryByLabelText("Company")).toBeNull();
		expect(alerts()).toEqual([]);
	});

	it("2: business branch shows the company step; Next is disabled while onSubmit is pending", async () => {
		const submit = createDeferred();
		const companySubmit = vi.fn(() => submit.promise);
		renderWizard(variant, { companySubmit });

		await reachCompany();
		expect(nextButton().textContent).toBe("Next");

		fireEvent.click(nextButton());
		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		expect(companySubmit).toHaveBeenCalledWith(
			expect.objectContaining({ accountType: "business", company: "Acme" }),
		);
		expect(nextButton().disabled).toBe(true);
		expect(backButton().disabled).toBe(true);
		expect(screen.getByRole("heading").textContent).toBe("Company");

		submit.resolve();
		await findHeading("Review");
		await waitUntilEnabled(nextButton());
		expect(nextButton().textContent).toBe("Finish");
		expect(stepStatus("company")).toBe("completed");
		expect(progressPercent()).toBe(75);
	});

	it("3: validation UX shows field errors and an error status, then clears them", async () => {
		renderWizard(variant);
		await findHeading("Personal");

		fireEvent.click(nextButton());
		expect((await screen.findByTestId("error-name")).textContent).toBe(
			"Name is required",
		);
		expect(screen.getByTestId("error-email").textContent).toBe(
			"Email is required",
		);
		expect(stepStatus("personal")).toBe("error");
		expect(screen.getByRole("heading").textContent).toBe("Personal");

		typeInto("Name", "Ada");
		typeInto("Email", "not-an-email");
		await waitUntilEnabled(nextButton());
		fireEvent.click(nextButton());
		await waitFor(() => expect(screen.queryByTestId("error-name")).toBeNull());
		expect(screen.getByTestId("error-email").textContent).toBe(
			"Email must contain @",
		);
		expect(stepStatus("personal")).toBe("error");

		typeInto("Email", "ada@example.com");
		await clickNextTo("Account");
		expect(screen.queryByTestId("error-name")).toBeNull();
		expect(screen.queryByTestId("error-email")).toBeNull();
		expect(stepStatus("personal")).toBe("completed");
		expect(stepStatus("account")).toBe("active");
		// Validation failures are field-level only, never in the error area.
		expect(alerts()).toEqual([]);
	});

	it("4a: Back follows history; switching to personal goes straight to review; progress never drops on Back", async () => {
		const onStepRender = vi.fn();
		renderWizard(variant, {}, { onStepRender });
		await findHeading("Personal");
		await flush();
		expect(backButton().disabled).toBe(true);

		const backSteps: Array<[number, number]> = [];
		const back = async (to: string) => {
			const before = progressPercent();
			await clickBackTo(to);
			backSteps.push([before, progressPercent()]);
		};

		fillPersonal();
		await clickNextTo("Account");
		choose("Account type", "business");
		await clickNextTo("Company");
		typeInto("Company", "Acme");
		await clickNextTo("Review");
		expect(progressPercent()).toBe(75);

		await back("Company");
		expect(inputValue("Company")).toBe("Acme");
		await back("Account");

		choose("Account type", "personal");
		const companyRenders = onStepRender.mock.calls.filter(
			([id]) => id === "company",
		).length;
		await clickNextTo("Review");
		expect(
			onStepRender.mock.calls.filter(([id]) => id === "company").length,
		).toBe(companyRenders);

		await back("Account");
		await back("Personal");
		expect(inputValue("Name")).toBe("Ada");
		await flush();
		expect(backButton().disabled).toBe(true);

		expect(backSteps).toHaveLength(4);
		for (const [before, after] of backSteps) {
			expect(after).toBeGreaterThanOrEqual(before);
		}
	});

	it("4b: from review, Back skips the company step once it became disabled", async () => {
		const onStepRender = vi.fn();
		renderWizard(variant, {}, { onStepRender });
		await reachCompany();
		await clickNextTo("Review");
		expect(onStepRender).toHaveBeenCalledTimes(4);
		expect(progressPercent()).toBe(75);

		choose("Change account type", "personal");
		// A data change alone never re-evaluates function guards: company keeps
		// its status (and its share of the progress) until the next navigation.
		expect(stepStatus("company")).toBe("completed");
		expect(progressPercent()).toBe(75);

		await clickBackTo("Account");

		// company was never re-rendered on the way back
		expect(
			onStepRender.mock.calls.filter(([id]) => id === "company"),
		).toHaveLength(1);
		// The Back navigation re-evaluates the guard: company leaves the path and
		// is excluded from progress, so 2 of the 3 remaining steps are completed.
		expect(stepStatus("company")).toBe("skipped");
		expect(stepStatus("personal")).toBe("completed");
		expect(stepStatus("account")).toBe("completed");
		expect(stepStatus("review")).toBe("visited");
		expect(progressPercent()).toBe(67);
		expect(alerts()).toEqual([]);
	});

	it("5: a double click while onSubmit is pending runs a single navigation", async () => {
		const submit = createDeferred();
		const companySubmit = vi.fn(() => submit.promise);
		const onStepEnter = vi.fn();
		renderWizard(variant, { companySubmit }, { onStepEnter });
		await reachCompany();

		const next = nextButton();
		fireEvent.click(next);
		fireEvent.click(next);
		// isNavigating flips synchronously, so the button is already disabled.
		expect(next.disabled).toBe(true);

		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		fireEvent.click(next);
		await flush();
		expect(next.disabled).toBe(true);
		expect(companySubmit).toHaveBeenCalledTimes(1);

		submit.resolve();
		await findHeading("Review");
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(
			onStepEnter.mock.calls.filter(([id]) => id === "review"),
		).toHaveLength(1);
		await waitUntilEnabled(nextButton());
		expect(alerts()).toEqual([]);
	});

	it("6: a rejected definition.onComplete keeps the user on review; Finish again completes", async () => {
		const definitionOnComplete = vi
			.fn<(data: RegistrationData) => Promise<void>>()
			.mockRejectedValueOnce(new Error("Server unavailable"))
			.mockResolvedValue(undefined);
		const onComplete = vi.fn();
		const onError = vi.fn();
		renderWizard(
			variant,
			{ onComplete: definitionOnComplete },
			{ onComplete, onError },
		);
		await reachReviewViaPersonal();
		toggle("I agree to the terms");

		fireEvent.click(nextButton());
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Server unavailable",
		);
		expect(alerts()).toHaveLength(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Server unavailable" }),
		);
		expect(screen.getByRole("heading").textContent).toBe("Review");
		expect(onComplete).not.toHaveBeenCalled();
		await waitUntilEnabled(nextButton());
		expect(nextButton().textContent).toBe("Finish");

		fireEvent.click(nextButton());
		await findHeading("Registration complete");
		expect(alerts()).toEqual([]);
		expect(definitionOnComplete).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("7a: Reset returns to the first step with initial data and fresh statuses", async () => {
		renderWizard(variant);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		// Entering account ran the company guard with an empty accountType:
		// company is skipped, so personal is 1 of 3 enabled steps.
		expect(stepStatus("company")).toBe("skipped");
		expect(progressPercent()).toBe(33);
		choose("Account type", "business");
		// Choosing business does not re-run the guard before the next navigation.
		expect(stepStatus("company")).toBe("skipped");
		expect(progressPercent()).toBe(33);

		fireEvent.click(button("Reset"));
		await findHeading("Personal");
		// The initial guard refresh after reset runs one microtask later.
		await flush();
		expect(inputValue("Name")).toBe("");
		expect(inputValue("Email")).toBe("");
		expect(stepStatus("personal")).toBe("active");
		expect(stepStatus("account")).toBe("pristine");
		expect(stepStatus("company")).toBe("skipped");
		expect(stepStatus("review")).toBe("pristine");
		expect(progressPercent()).toBe(0);
		expect(backButton().disabled).toBe(true);

		// The reset data really is the initial data: account type is empty again.
		fillPersonal();
		await clickNextTo("Account");
		expect(
			(screen.getByLabelText("Account type") as HTMLSelectElement).value,
		).toBe("");
	});

	it("7b: reset(X) makes X the baseline for a later bare Reset", async () => {
		const sampleData: RegistrationData = {
			...createInitialData(),
			name: "Grace",
			email: "grace@example.com",
		};
		renderWizard(variant, {}, { sampleData });
		await findHeading("Personal");

		fireEvent.click(button("Load sample"));
		await waitFor(() => expect(inputValue("Name")).toBe("Grace"));
		expect(inputValue("Email")).toBe("grace@example.com");

		typeInto("Name", "Changed");
		await clickNextTo("Account");

		fireEvent.click(button("Reset"));
		await findHeading("Personal");
		expect(inputValue("Name")).toBe("Grace");
		expect(inputValue("Email")).toBe("grace@example.com");
		expect(stepStatus("account")).toBe("pristine");
	});

	it("7c: Cancel awaits onCancel, then returns to the first step", async () => {
		const cancelled = createDeferred();
		const onCancel = vi.fn(() => cancelled.promise);
		renderWizard(variant, {}, { onCancel });
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		choose("Account type", "personal");

		fireEvent.click(button("Cancel"));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCancel).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Ada", accountType: "personal" }),
		);
		await flush();
		// Still on account while the handler is pending; navigation is locked.
		expect(screen.getByRole("heading").textContent).toBe("Account");
		expect(nextButton().disabled).toBe(true);
		expect(backButton().disabled).toBe(true);

		cancelled.resolve();
		await findHeading("Personal");
		expect(inputValue("Name")).toBe("");
		expect(stepStatus("personal")).toBe("active");
		expect(stepStatus("account")).toBe("pristine");
		expect(progressPercent()).toBe(0);
		await waitUntilEnabled(nextButton());
		expect(alerts()).toEqual([]);
	});
});

describe("registration wizard: step statuses", () => {
	// Function `enabled` guards are re-evaluated after every navigation: on the
	// personal path company is "skipped" and excluded from progress (review:
	// personal + account completed out of 3 enabled steps).
	it("4c: company is reported skipped after navigating past it on the personal path", async () => {
		renderWizard("direct");
		await reachReviewViaPersonal();
		expect(stepStatus("company")).toBe("skipped");
		expect(progressPercent()).toBe(67);
	});
});
