import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { variants } from "./components";
import {
	createRegistrationWizard,
	isBusiness,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	bannerText,
	checkAgree,
	clickPrimary,
	completeAccount,
	completePersonal,
	expectStep,
	selectAccountType,
	stepStatus,
	typeInto,
} from "./helpers";

const errorText = (field: string) =>
	screen.queryByTestId(`error-${field}`)?.textContent ?? null;

describe.each(variants)("validation UX ($name)", ({ Component }) => {
	it("shows field errors and an error status, then clears them once fixed", async () => {
		const onError = vi.fn<(e: Error) => void>();
		render(
			<Component definition={createRegistrationWizard()} onError={onError} />,
		);
		await expectStep("personal");

		await clickPrimary("Next");
		await waitFor(() => expect(errorText("name")).toBe("Name is required"));
		expect(errorText("email")).toBe("Email is required");
		expect(stepStatus("personal")).toBe("error");
		// Still on the same step; the validation failure is rendered per field,
		// not in the generic banner.
		expect(
			screen.getByRole("heading", { level: 2, name: "Personal details" }),
		).toBeTruthy();
		expect(bannerText()).toBe("");
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ name: "WizardValidationError" }),
		);

		// Partially fixed: the name error goes away, the email error changes.
		typeInto("Name", "Ada");
		typeInto("Email", "ada.example.com");
		await clickPrimary("Next");
		await waitFor(() =>
			expect(errorText("email")).toBe("Email must contain @"),
		);
		expect(errorText("name")).toBeNull();
		expect(stepStatus("personal")).toBe("error");

		typeInto("Email", "ada@example.com");
		await clickPrimary("Next");
		await expectStep("account");
		expect(errorText("name")).toBeNull();
		expect(errorText("email")).toBeNull();
		expect(stepStatus("personal")).toBe("completed");
		expect(stepStatus("account")).toBe("active");

		// Same UX on a synchronous validator.
		await clickPrimary("Next");
		await waitFor(() =>
			expect(errorText("accountType")).toBe("Account type is required"),
		);
		expect(stepStatus("account")).toBe("error");
		selectAccountType("personal");
		await clickPrimary("Next");
		await expectStep("review");
		expect(errorText("accountType")).toBeNull();
		expect(stepStatus("account")).toBe("completed");
	});
});

describe.each(variants)("completion failure ($name)", ({ Component }) => {
	it("stays on review when definition.onComplete rejects, then completes on retry", async () => {
		const definitionOnComplete = vi
			.fn<(d: RegistrationData) => Promise<void>>()
			.mockRejectedValueOnce(new Error("Server unavailable"))
			.mockResolvedValue(undefined);
		const onComplete = vi.fn();
		const onError = vi.fn<(e: Error) => void>();
		render(
			<Component
				definition={createRegistrationWizard({
					onComplete: definitionOnComplete,
				})}
				onComplete={onComplete}
				onError={onError}
			/>,
		);

		await completePersonal();
		await completeAccount("personal");
		checkAgree();
		await clickPrimary("Finish");

		await waitFor(() => expect(bannerText()).toBe("Server unavailable"));
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Server unavailable" }),
		);
		expect(screen.queryByTestId("completion")).toBeNull();
		expect(
			screen.getByRole("heading", { level: 2, name: "Review" }),
		).toBeTruthy();
		expect(onComplete).not.toHaveBeenCalled();

		await clickPrimary("Finish");
		await screen.findByRole("heading", { name: "Registration complete" });
		expect(bannerText()).toBe("");
		expect(definitionOnComplete).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});

describe.each(variants)("error surfacing ($name)", ({ Component }) => {
	it("reports a guard that throws during the background navigation compute without crashing", async () => {
		const onError = vi.fn<(e: Error) => void>();
		const definition = createRegistrationWizard({
			companyEnabled: (d) => {
				if (d.name === "Crash Test") throw new Error("guard exploded");
				return isBusiness(d);
			},
		});
		render(<Component definition={definition} onError={onError} />);
		await expectStep("personal");

		// Only the manager's navigation recompute evaluates the company guard on
		// this step (getAvailableSteps) — the error must still reach onError.
		typeInto("Name", "Crash Test");
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "guard exploded" }),
			),
		);
		await waitFor(() => expect(bannerText()).toBe("guard exploded"));

		// The app is still alive and usable.
		expect(
			screen.getByRole("heading", { level: 2, name: "Personal details" }),
		).toBeTruthy();
		await completePersonal("Ada", "ada@example.com");
		expect(bannerText()).toBe("");
	});

	it("surfaces a guard that throws during goNext and keeps the user on the step", async () => {
		const onError = vi.fn<(e: Error) => void>();
		const definition = createRegistrationWizard({
			companyEnabled: (d) => {
				if (d.accountType === "business")
					throw new Error("company lookup failed");
				return false;
			},
		});
		render(<Component definition={definition} onError={onError} />);

		await completePersonal();
		selectAccountType("business");
		await clickPrimary("Next");

		await waitFor(() => expect(bannerText()).toBe("company lookup failed"));
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "company lookup failed" }),
		);
		expect(
			screen.getByRole("heading", { level: 2, name: "Account type" }),
		).toBeTruthy();

		// Recoverable: another branch still works.
		selectAccountType("personal");
		await clickPrimary("Next");
		await expectStep("review");
		expect(bannerText()).toBe("");
	});
});
