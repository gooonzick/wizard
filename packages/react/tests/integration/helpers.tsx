import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import {
	type RegistrationStepId,
	STEP_IDS,
	STEP_TITLES,
} from "./fixtures/registration-wizard";

export const nextButton = () => screen.getByTestId("next") as HTMLButtonElement;
export const backButton = () => screen.getByTestId("back") as HTMLButtonElement;
export const bannerText = () => screen.getByTestId("wizard-error").textContent;
export const progressText = () => screen.getByTestId("progress").textContent;
export const stepStatus = (id: RegistrationStepId) =>
	screen.getByTestId(`step-${id}`).getAttribute("data-status");
export const statuses = () =>
	Object.fromEntries(STEP_IDS.map((id) => [id, stepStatus(id)]));

/** Flush pending microtasks (async validators, nav recompute) inside act. */
export async function flush(): Promise<void> {
	await act(async () => {});
}

/** Waits until the given step's panel heading is rendered. */
export async function expectStep(id: RegistrationStepId): Promise<void> {
	await screen.findByRole("heading", { level: 2, name: STEP_TITLES[id] });
}

/**
 * Clicks the primary button once it is enabled AND shows `label`. The label
 * (navigation.isLastStep) is seeded synchronously when the current step
 * changes, but the full navigation slice (guard-aware canGoNext etc.) and the
 * loading flag still settle asynchronously; waiting for both guards against
 * clicking a stale button ("Finish" calls submit() instead of goNext()).
 */
export async function clickPrimary(label: "Next" | "Finish"): Promise<void> {
	await waitFor(() => {
		expect(nextButton().disabled).toBe(false);
		expect(nextButton().textContent).toBe(label);
	});
	fireEvent.click(nextButton());
}

export async function clickBack(): Promise<void> {
	await waitFor(() => expect(backButton().disabled).toBe(false));
	fireEvent.click(backButton());
}

export function typeInto(label: string, value: string): void {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

export function selectAccountType(value: "" | "personal" | "business"): void {
	fireEvent.change(screen.getByLabelText("Account type"), {
		target: { value },
	});
}

export function checkAgree(): void {
	fireEvent.click(screen.getByLabelText("I agree to the terms"));
}

export async function completePersonal(
	name = "Ada Lovelace",
	email = "ada@example.com",
): Promise<void> {
	await expectStep("personal");
	typeInto("Name", name);
	typeInto("Email", email);
	await clickPrimary("Next");
	await expectStep("account");
}

export async function completeAccount(
	type: "personal" | "business",
): Promise<void> {
	await expectStep("account");
	selectAccountType(type);
	await clickPrimary("Next");
	await expectStep(type === "business" ? "company" : "review");
}
