import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { maybeStrict, variants } from "./components";
import {
	createDeferred,
	createRegistrationWizard,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	backButton,
	bannerText,
	clickBack,
	clickPrimary,
	completeAccount,
	completePersonal,
	expectStep,
	nextButton,
	progressText,
	selectAccountType,
	stepStatus,
	typeInto,
} from "./helpers";

const percent = () => Number.parseInt(progressText() ?? "", 10);

describe.each(variants)("branching ($name)", ({ Component }) => {
	it.each([
		{ strict: false, mode: "plain" },
		{ strict: true, mode: "StrictMode" },
	])("business account: shows the company step and awaits its async onSubmit before review ($mode)", async ({
		strict,
	}) => {
		const submit = createDeferred();
		const companySubmit = vi.fn((_d: RegistrationData) => submit.promise);
		const definition = createRegistrationWizard({ companySubmit });

		render(maybeStrict(<Component definition={definition} />, strict));

		await completePersonal();
		await completeAccount("business");
		expect(screen.getByLabelText("Company")).toBeTruthy();

		typeInto("Company", "Analytical Engines Ltd");
		await clickPrimary("Next");

		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		expect(companySubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				accountType: "business",
				company: "Analytical Engines Ltd",
			}),
		);
		// Pending onSubmit: still on company, Next and Back locked.
		expect(nextButton().disabled).toBe(true);
		expect(backButton().disabled).toBe(true);
		expect(
			screen.getByRole("heading", { level: 2, name: "Company" }),
		).toBeTruthy();

		await act(async () => {
			submit.resolve();
		});

		await expectStep("review");
		await waitFor(() => expect(nextButton().disabled).toBe(false));
		expect(screen.getByTestId("summary-company").textContent).toBe(
			"Analytical Engines Ltd",
		);
		expect(stepStatus("company")).toBe("completed");
		expect(bannerText()).toBe("");
	});
});

describe.each(variants)("back navigation ($name)", ({ Component }) => {
	it("Back is disabled on the first step", async () => {
		render(<Component definition={createRegistrationWizard()} />);
		await expectStep("personal");
		// Let the async navigation compute (canGoPrevious) settle, then re-check.
		await waitFor(() => expect(nextButton().textContent).toBe("Next"));
		expect(backButton().disabled).toBe(true);
	});

	it("re-branches after going Back: business -> company -> review, Back x2, switch to personal, Next skips company", async () => {
		const companySubmit = vi.fn(async (_d: RegistrationData) => {});
		const definition = createRegistrationWizard({ companySubmit });
		render(<Component definition={definition} />);

		const seen: number[] = [];
		await completePersonal();
		seen.push(percent());
		await completeAccount("business");
		seen.push(percent());
		typeInto("Company", "Acme");
		await clickPrimary("Next");
		await expectStep("review");
		seen.push(percent());
		// Business path: 3 of 4 enabled steps completed.
		expect(seen).toEqual([33, 50, 75]);

		await clickBack();
		await expectStep("company");
		seen.push(percent());
		expect(screen.getByLabelText<HTMLInputElement>("Company").value).toBe(
			"Acme",
		);

		await clickBack();
		await expectStep("account");
		seen.push(percent());
		expect(screen.getByLabelText<HTMLSelectElement>("Account type").value).toBe(
			"business",
		);
		// Progress never regresses while going Back on an unchanged branch.
		for (let i = 1; i < seen.length; i++) {
			expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
		}
		expect(stepStatus("company")).toBe("completed");

		selectAccountType("personal");
		await clickPrimary("Next");
		await expectStep("review");

		expect(screen.queryByRole("heading", { name: "Company" })).toBeNull();
		// Switching branch marks the (previously completed) company step
		// "skipped": it leaves progress entirely -> 2 of 3 enabled steps.
		expect(stepStatus("company")).toBe("skipped");
		expect(percent()).toBe(67);
		// company.onSubmit ran only on the original business pass.
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(bannerText()).toBe("");
	});

	it("Back from review skips the company step once it is disabled (history is guard-aware)", async () => {
		const definition = createRegistrationWizard({
			companySubmit: async () => {},
		});
		render(<Component definition={definition} />);

		await completePersonal();
		await completeAccount("business");
		typeInto("Company", "Acme");
		await clickPrimary("Next");
		await expectStep("review");
		expect(stepStatus("company")).toBe("completed");
		expect(percent()).toBe(75);

		// Change the branch on the review step itself: company is now disabled
		// but still sits in the history stack.
		selectAccountType("personal");
		await clickBack();

		await expectStep("account");
		expect(screen.queryByLabelText("Company")).toBeNull();
		expect(bannerText()).toBe("");
		// The goPrevious guard refresh marks company "skipped", dropping it from
		// progress: personal + account completed of 3 enabled steps.
		expect(stepStatus("company")).toBe("skipped");
		expect(percent()).toBe(67);

		// History was popped past company: Back again reaches personal, then stops.
		await clickBack();
		await expectStep("personal");
		expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
			"Ada Lovelace",
		);
		await waitFor(() => expect(backButton().disabled).toBe(true));
	});
});
