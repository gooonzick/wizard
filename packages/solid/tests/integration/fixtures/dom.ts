import { fireEvent, screen, waitFor } from "@solidjs/testing-library";

/** The primary nav button; its label flips between "Next" and "Finish". */
export const nextButton = (): HTMLButtonElement =>
	screen.getByTestId("next") as HTMLButtonElement;

export const backButton = (): HTMLButtonElement =>
	screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;

export const button = (name: string): HTMLButtonElement =>
	screen.getByRole("button", { name }) as HTMLButtonElement;

export const findHeading = (name: string): Promise<HTMLElement> =>
	screen.findByRole("heading", { name });

export const currentHeading = (): string =>
	screen.getByRole("heading").textContent ?? "";

export const stepStatus = (stepId: string): string | null =>
	screen.getByTestId(`step-${stepId}`).getAttribute("data-status");

export const progressPercent = (): number =>
	Number.parseInt(screen.getByTestId("progress").textContent ?? "", 10);

export const inputValue = (label: string): string =>
	(screen.getByLabelText(label) as HTMLInputElement).value;

export const alerts = (): string[] =>
	screen.queryAllByRole("alert").map((el) => el.textContent ?? "");

export function typeInto(label: string, value: string): void {
	fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

export function choose(label: string, value: string): void {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

export function toggle(label: string): void {
	fireEvent.click(screen.getByLabelText(label));
}

/**
 * Clicks the primary nav button, waits for the given step heading and then for
 * the transition to settle (the heading renders before `isNavigating` clears,
 * and a click on the still-disabled button would be ignored).
 */
export async function clickNextTo(heading: string): Promise<void> {
	await waitUntilEnabled(nextButton());
	fireEvent.click(nextButton());
	await findHeading(heading);
	await waitUntilEnabled(nextButton());
}

/** Clicks Back once it is enabled (canGoPrevious is computed asynchronously). */
export async function clickBackTo(heading: string): Promise<void> {
	await screen.findByRole("button", { name: "Back" });
	const back = backButton();
	await waitUntilEnabled(back);
	fireEvent.click(back);
	await findHeading(heading);
	await waitUntilEnabled(nextButton());
}

export async function waitUntilEnabled(el: HTMLButtonElement): Promise<void> {
	await waitFor(() => {
		if (el.disabled) throw new Error("still disabled");
	});
}

/** Fills the personal step with valid values. */
export function fillPersonal(name = "Ada", email = "ada@example.com"): void {
	typeInto("Name", name);
	typeInto("Email", email);
}
