import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { maybeStrict, variants } from "./components";
import {
	createRegistrationWizard,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	bannerText,
	checkAgree,
	clickPrimary,
	completeAccount,
	completePersonal,
	expectStep,
	nextButton,
	progressText,
	statuses,
} from "./helpers";

describe.each(variants)("happy path ($name)", ({ Component }) => {
	it.each([
		{ strict: false, mode: "plain" },
		{ strict: true, mode: "StrictMode" },
	])("personal account: fills every step, finishes and shows the completion screen ($mode)", async ({
		strict,
	}) => {
		const definitionOnComplete = vi.fn<(d: RegistrationData) => void>();
		const onComplete = vi.fn<(d: RegistrationData) => void>();
		const definition = createRegistrationWizard({
			onComplete: definitionOnComplete,
		});

		render(
			maybeStrict(
				<Component definition={definition} onComplete={onComplete} />,
				strict,
			),
		);

		await expectStep("personal");
		// The initial guard refresh lands one microtask after the first render:
		// company (accountType "" is not "business") is marked "skipped".
		await waitFor(() =>
			expect(statuses()).toEqual({
				personal: "active",
				account: "pristine",
				company: "skipped",
				review: "pristine",
			}),
		);
		// Skipped steps are excluded from progress: 3 enabled steps.
		expect(progressText()).toBe("0%");

		await completePersonal();
		expect(progressText()).toBe("33%");

		await completeAccount("personal");
		expect(progressText()).toBe("67%");
		// The company step was never rendered on the personal branch.
		expect(screen.queryByRole("heading", { name: "Company" })).toBeNull();
		expect(screen.queryByLabelText("Company")).toBeNull();
		expect(screen.getByTestId("summary-name").textContent).toBe("Ada Lovelace");
		expect(screen.getByTestId("summary-email").textContent).toBe(
			"ada@example.com",
		);

		checkAgree();
		await clickPrimary("Finish");

		await screen.findByRole("heading", { name: "Registration complete" });
		expect(screen.getByText("Welcome, Ada Lovelace!")).toBeTruthy();
		expect(screen.queryByTestId("next")).toBeNull();
		expect(bannerText()).toBe("");

		const finalData: RegistrationData = {
			name: "Ada Lovelace",
			email: "ada@example.com",
			accountType: "personal",
			company: "",
			agree: true,
		};
		expect(definitionOnComplete).toHaveBeenCalledTimes(1);
		expect(definitionOnComplete).toHaveBeenCalledWith(finalData);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(finalData);
		// complete() marks the final step "completed" in the same write as
		// isCompleted; company stays "skipped" on the personal path, so the
		// finished wizard reports 100%.
		expect(statuses()).toEqual({
			personal: "completed",
			account: "completed",
			company: "skipped",
			review: "completed",
		});
		expect(progressText()).toBe("100%");
	});

	// navigation.isLastStep is seeded synchronously from
	// state.progress.isLastStep, so a non-last first step never flashes "Finish".
	it("does not show 'Finish' on the first render of the first step", () => {
		const definition = createRegistrationWizard();
		render(<Component definition={definition} />);
		// Synchronously after mount — no awaiting the async navigation compute.
		expect(nextButton().textContent).toBe("Next");
	});
});
