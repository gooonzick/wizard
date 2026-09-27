import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { flush } from "../helpers/flush";
import {
	button,
	check,
	choose,
	click,
	currentStep,
	deferred,
	errorArea,
	expectStep,
	fillPersonal,
	input,
	progressText,
	progressValue,
	reachAccount,
	reachCompany,
	reachReviewPersonal,
	select,
	stepStatus,
	type,
} from "./harness";
import {
	blankData,
	createRegistrationDefinition,
	MESSAGES,
	type RegistrationData,
	type RegistrationOptions,
	STEP_IDS,
} from "./registration";
import { type Variant, variants } from "./variants";

function setup(
	variant: Variant,
	definitionOptions: RegistrationOptions = {},
	props: Record<string, unknown> = {},
) {
	const onError = vi.fn();
	const onComplete = vi.fn();
	const onStepEnter = vi.fn();
	const result = render(variant.Component, {
		props: {
			definition: createRegistrationDefinition(definitionOptions),
			onError,
			onComplete,
			onStepEnter,
			...props,
		},
	});
	const enteredSteps = (): string[] =>
		onStepEnter.mock.calls.map(([id]) => id as string);
	return { ...result, onError, onComplete, onStepEnter, enteredSteps };
}

describe.each(variants)("registration wizard — $name", (variant) => {
	it("1. happy path (personal): Finish shows completion, onComplete fires once, company never rendered", async () => {
		const definitionOnComplete = vi.fn();
		const { onComplete, enteredSteps } = setup(variant, {
			onComplete: definitionOnComplete,
		});

		await expectStep("personal");
		expect(stepStatus("personal")).toBe("active");
		expect(progressText()).toBe("0%");
		expect(screen.queryByLabelText("Company")).toBeNull();
		// The initial entry refreshes guard-disabled steps one microtask later.
		await waitFor(() => expect(stepStatus("company")).toBe("skipped"));

		await fillPersonal("Ada Lovelace", "ada@example.com");
		await click("Next");
		await expectStep("account");
		expect(stepStatus("personal")).toBe("completed");
		// Skipped company is excluded from progress: 1 of 3 enabled steps.
		expect(stepStatus("company")).toBe("skipped");
		expect(progressText()).toBe("33%");
		expect(screen.queryByLabelText("Company")).toBeNull();

		await choose("Account type", "personal");
		await click("Next");
		await expectStep("review");
		expect(stepStatus("account")).toBe("completed");
		expect(stepStatus("company")).toBe("skipped");
		expect(progressText()).toBe("67%");
		expect(screen.queryByLabelText("Company")).toBeNull();
		expect(screen.getByTestId("summary").textContent).toBe(
			"Ada Lovelace / ada@example.com / personal",
		);
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

		await check("I agree to the terms");
		await click("Finish");

		await screen.findByText("Registration complete");
		expect(screen.getByText("Welcome, Ada Lovelace!")).toBeTruthy();
		expect(screen.queryByTestId("current-step")).toBeNull();

		const finalData: RegistrationData = {
			name: "Ada Lovelace",
			email: "ada@example.com",
			accountType: "personal",
			company: "",
			agree: true,
		};
		expect(definitionOnComplete).toHaveBeenCalledTimes(1);
		expect(definitionOnComplete.mock.calls[0][0]).toEqual(finalData);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(finalData);

		expect(enteredSteps()).not.toContain("company");
		// complete() marks the final step completed with isCompleted.
		expect(stepStatus("review")).toBe("completed");
		expect(stepStatus("company")).toBe("skipped");
		expect(progressText()).toBe("100%");
		expect(errorArea()).toBeNull();
	});

	it("2. business branch: company step; Next disabled while its onSubmit is pending, then review", async () => {
		const gate = deferred();
		const companySubmit = vi.fn((_data: RegistrationData) => gate.promise);
		setup(variant, { companySubmit });

		await reachCompany();
		expect(stepStatus("account")).toBe("completed");
		await type("Company", "Acme Ltd");

		await click("Next");
		await waitFor(() => expect(button("Next").disabled).toBe(true));
		expect(button("Back").disabled).toBe(true);
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(companySubmit.mock.calls[0][0]).toMatchObject({
			accountType: "business",
			company: "Acme Ltd",
		});

		await flush();
		expect(currentStep()).toBe("company");
		expect(button("Next").disabled).toBe(true);

		gate.resolve();
		await expectStep("review");
		await waitFor(() => expect(button("Finish").disabled).toBe(false));
		expect(button("Back").disabled).toBe(false);
		expect(stepStatus("company")).toBe("completed");
		expect(progressText()).toBe("75%");
		expect(screen.getByTestId("summary").textContent).toBe(
			"Ada Lovelace / ada@example.com / business",
		);
	});

	it("3. validation UX: empty Next shows field errors and data-status=error; fixing clears them", async () => {
		setup(variant);
		await expectStep("personal");

		await click("Next");
		await screen.findByText(MESSAGES.name);
		expect(screen.getByText(MESSAGES.email)).toBeTruthy();
		expect(stepStatus("personal")).toBe("error");
		expect(currentStep()).toBe("personal");

		// Partially fix: the name error goes away, the email error stays.
		await type("Name", "Ada");
		await type("Email", "not-an-email");
		await click("Next");
		await waitFor(() => expect(screen.queryByText(MESSAGES.name)).toBeNull());
		expect(screen.getByText(MESSAGES.email)).toBeTruthy();
		expect(stepStatus("personal")).toBe("error");

		await type("Email", "ada@example.com");
		await click("Next");
		await expectStep("account");
		expect(screen.queryByText(MESSAGES.name)).toBeNull();
		expect(screen.queryByText(MESSAGES.email)).toBeNull();
		expect(stepStatus("personal")).toBe("completed");
		expect(stepStatus("account")).toBe("active");

		// Coming back shows the fixed values and no stale errors.
		await waitFor(() => expect(button("Back").disabled).toBe(false));
		await click("Back");
		await expectStep("personal");
		expect(input("Email").value).toBe("ada@example.com");
		expect(screen.queryByText(MESSAGES.email)).toBeNull();
		expect(stepStatus("personal")).toBe("completed");

		// Other steps validate the same way.
		await click("Next");
		await expectStep("account");
		await click("Next");
		await screen.findByText(MESSAGES.accountType);
		expect(stepStatus("account")).toBe("error");
	});

	it("4. Back navigation follows history (not .previous()), re-branches, and never lowers progress", async () => {
		const { enteredSteps } = setup(variant);
		await expectStep("personal");
		await flush();
		expect(button("Back").disabled).toBe(true);

		// Clicks Back and asserts it lands on `stepId` without lowering progress.
		const back = async (stepId: string) => {
			await waitFor(() => expect(button("Back").disabled).toBe(false));
			const before = progressValue();
			await click("Back");
			await expectStep(stepId);
			expect(progressValue()).toBeGreaterThanOrEqual(before);
		};

		await reachCompany();
		// Business enables company again: it leaves "skipped" and counts.
		expect(stepStatus("company")).toBe("active");
		expect(progressValue()).toBe(50);
		await type("Company", "Acme Ltd");
		await click("Next");
		await expectStep("review");
		expect(progressValue()).toBe(75);

		// review -> company -> account, via history.
		await back("company");
		expect(input("Company").value).toBe("Acme Ltd");
		expect(progressValue()).toBe(75);

		await back("account");
		expect(select("Account type").value).toBe("business");
		expect(progressValue()).toBe(75);

		// Switch branch: personal goes straight to review, never via company.
		const companyEntries = () =>
			enteredSteps().filter((id) => id === "company").length;
		const companyEntriesBefore = companyEntries();
		await choose("Account type", "personal");
		await click("Next");
		await expectStep("review");
		expect(companyEntries()).toBe(companyEntriesBefore);
		// Company is guard-disabled again: skipped and excluded from progress
		// (2 of 3 enabled steps completed).
		expect(stepStatus("company")).toBe("skipped");
		expect(progressValue()).toBe(67);

		// review.previous is statically "company", but company is now disabled
		// and no longer in the history: Back must land on account.
		await back("account");
		expect(stepStatus("company")).toBe("skipped");
		expect(progressValue()).toBe(67);

		await waitFor(() => expect(button("Back").disabled).toBe(false));
		await click("Back");
		await expectStep("personal");
		await waitFor(() => expect(button("Back").disabled).toBe(true));
	});

	it("5. double-clicking Next while onSubmit is pending navigates once and keeps Next disabled", async () => {
		const gate = deferred();
		const companySubmit = vi.fn((_data: RegistrationData) => gate.promise);
		const { enteredSteps } = setup(variant, { companySubmit });

		await reachCompany();
		await type("Company", "Acme Ltd");

		// Two clicks dispatched back-to-back, before Svelte re-renders.
		const next = button("Next");
		await Promise.all([fireEvent.click(next), fireEvent.click(next)]);
		await tick();
		expect(button("Next").disabled).toBe(true);

		await flush();
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(currentStep()).toBe("company");
		// The second click really reached the machine (not just a disabled
		// button) and was rejected as busy, surfacing via the caught promise.
		expect(errorArea()).toMatch(/already in progress/i);
		// The busy-rejected second click must not release the first one's flag.
		expect(button("Next").disabled).toBe(true);

		await fireEvent.click(button("Next")); // disabled: ignored
		await flush();
		expect(companySubmit).toHaveBeenCalledTimes(1);

		gate.resolve();
		await expectStep("review");
		await flush();
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(enteredSteps().filter((id) => id === "review")).toHaveLength(1);
		expect(stepStatus("company")).toBe("completed");
		expect(button("Finish").disabled).toBe(false);
	});

	it("6. a rejecting definition.onComplete keeps the user on review with an error; Finish again completes", async () => {
		const definitionOnComplete = vi
			.fn()
			.mockRejectedValueOnce(new Error("Server unavailable"))
			.mockResolvedValueOnce(undefined);
		const { onComplete, onError } = setup(variant, {
			onComplete: definitionOnComplete,
		});

		await reachReviewPersonal();
		await check("I agree to the terms");
		await click("Finish");

		await waitFor(() => expect(errorArea()).toBe("Server unavailable"));
		expect(currentStep()).toBe("review");
		expect(screen.queryByText("Registration complete")).toBeNull();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Server unavailable" }),
		);
		expect(onComplete).not.toHaveBeenCalled();
		await waitFor(() => expect(button("Finish").disabled).toBe(false));
		expect(input("I agree to the terms").checked).toBe(true);

		await click("Finish");
		await screen.findByText("Registration complete");
		expect(definitionOnComplete).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(errorArea()).toBeNull();
	});

	it("7a. Reset returns to the first step with initial data and fresh statuses", async () => {
		const { enteredSteps } = setup(variant);
		await reachAccount();
		await choose("Account type", "business");

		await click("Reset");
		await expectStep("personal");
		expect(input("Name").value).toBe("");
		expect(input("Email").value).toBe("");
		// The guard refresh after re-entering the initial step lands a microtask
		// later: company (accountType is blank again) is skipped.
		await flush();
		expect(progressText()).toBe("0%");
		const expected: Record<string, string> = {
			personal: "active",
			account: "pristine",
			company: "skipped",
			review: "pristine",
		};
		for (const id of STEP_IDS) {
			expect(stepStatus(id)).toBe(expected[id]);
		}
		expect(button("Back").disabled).toBe(true);
		// reset() re-enters the initial step
		expect(enteredSteps().filter((id) => id === "personal")).toHaveLength(2);

		// The account answer is gone too.
		await fillPersonal();
		await click("Next");
		await expectStep("account");
		expect(select("Account type").value).toBe("");
	});

	it("7b. reset(X) makes X the baseline: a later Reset (no arg) returns to X", async () => {
		const preset: RegistrationData = {
			...blankData,
			name: "Grace Hopper",
			email: "grace@navy.mil",
		};
		setup(variant, {}, { presetData: preset });
		await reachAccount();

		await click("Load preset");
		await expectStep("personal");
		expect(input("Name").value).toBe("Grace Hopper");

		await type("Name", "Someone Else");
		await click("Next");
		await expectStep("account");

		await click("Reset");
		await expectStep("personal");
		expect(input("Name").value).toBe("Grace Hopper");
		expect(input("Email").value).toBe("grace@navy.mil");
	});

	it("7c. Cancel awaits onCancel, then returns to the first step with initial data", async () => {
		const gate = deferred();
		const onCancel = vi.fn((_data: RegistrationData) => gate.promise);
		setup(variant, {}, { onCancel });
		await reachAccount();
		await choose("Account type", "business");

		await click("Cancel");
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onCancel.mock.calls[0][0]).toMatchObject({
			name: "Ada Lovelace",
			accountType: "business",
		});
		await flush();
		expect(currentStep()).toBe("account");
		expect(button("Next").disabled).toBe(true);
		expect(button("Back").disabled).toBe(true);

		gate.resolve();
		await expectStep("personal");
		expect(input("Name").value).toBe("");
		expect(stepStatus("account")).toBe("pristine");
		await waitFor(() => expect(button("Next").disabled).toBe(false));
		expect(errorArea()).toBeNull();
	});

	it("10. a throwing guard is reported through onError without crashing the UI", async () => {
		const boom = new Error("Guard exploded");
		const { onError } = setup(variant, {
			companyEnabled: (data) => {
				if (data.accountType === "business") {
					throw boom;
				}
				return false;
			},
		});

		await reachAccount();
		expect(onError).not.toHaveBeenCalledWith(boom);

		await choose("Account type", "business");
		await waitFor(() => expect(onError).toHaveBeenCalledWith(boom));

		await click("Next");
		await waitFor(() => expect(errorArea()).toBe("Guard exploded"));
		expect(currentStep()).toBe("account");
		await waitFor(() => expect(button("Next").disabled).toBe(false));

		// Still fully usable.
		await choose("Account type", "personal");
		await click("Next");
		await expectStep("review");
	});
});
