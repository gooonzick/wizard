import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { variants } from "./components";
import {
	createDeferred,
	createRegistrationWizard,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	backButton,
	clickPrimary,
	completePersonal,
	expectStep,
	nextButton,
	progressText,
	selectAccountType,
	statuses,
	stepStatus,
	typeInto,
} from "./helpers";

const PRESET: RegistrationData = {
	name: "Preset Person",
	email: "preset@example.com",
	accountType: "business",
	company: "Preset Co",
	agree: false,
};

const inputValue = (label: string) =>
	screen.getByLabelText<HTMLInputElement>(label).value;

describe.each(variants)("reset and cancel ($name)", ({ Component }) => {
	it("Reset returns to the first step with the initial data and fresh statuses", async () => {
		render(<Component definition={createRegistrationWizard()} />);
		await completePersonal();
		selectAccountType("business");
		// company was marked "skipped" by the goNext guard refresh (accountType
		// was still ""); selecting "business" only re-enables it at the next
		// navigation, so progress is 1 of 3 enabled steps.
		expect(stepStatus("company")).toBe("skipped");
		expect(progressText()).toBe("33%");

		fireEvent.click(screen.getByTestId("reset"));

		await expectStep("personal");
		expect(inputValue("Name")).toBe("");
		expect(inputValue("Email")).toBe("");
		// Fresh statuses; the post-reset guard refresh (one microtask later)
		// re-marks company "skipped" against the reset data.
		await waitFor(() =>
			expect(statuses()).toEqual({
				personal: "active",
				account: "pristine",
				company: "skipped",
				review: "pristine",
			}),
		);
		expect(progressText()).toBe("0%");
		await waitFor(() => expect(nextButton().textContent).toBe("Next"));
		expect(backButton().disabled).toBe(true);

		// The wizard is fully usable after the reset.
		await completePersonal("Grace", "grace@example.com");
	});

	it("reset(preset) makes the preset the sticky baseline for a later Reset()", async () => {
		render(
			<Component definition={createRegistrationWizard()} presetData={PRESET} />,
		);
		await expectStep("personal");

		fireEvent.click(screen.getByTestId("preset"));
		await waitFor(() => expect(inputValue("Name")).toBe("Preset Person"));
		expect(inputValue("Email")).toBe("preset@example.com");

		typeInto("Name", "Someone Else");
		await clickPrimary("Next");
		await expectStep("account");
		expect(screen.getByLabelText<HTMLSelectElement>("Account type").value).toBe(
			"business",
		);

		// No argument: falls back to the preset, not the original initialData.
		fireEvent.click(screen.getByTestId("reset"));
		await expectStep("personal");
		expect(inputValue("Name")).toBe("Preset Person");
		expect(inputValue("Email")).toBe("preset@example.com");
		expect(statuses().account).toBe("pristine");
	});

	it("Cancel awaits the async onCancel prop, then shows the first step", async () => {
		const pending = createDeferred();
		const onCancel = vi.fn((_d: RegistrationData) => pending.promise);
		const definitionOnCancel = vi.fn();
		render(
			<Component
				definition={createRegistrationWizard({
					onCancel: definitionOnCancel,
				})}
				onCancel={onCancel}
			/>,
		);
		await completePersonal();
		selectAccountType("personal");

		fireEvent.click(screen.getByTestId("cancel"));
		await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
		expect(definitionOnCancel).toHaveBeenCalledTimes(1);
		expect(onCancel).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Ada Lovelace",
				accountType: "personal",
			}),
		);

		// While the handler is pending the wizard has not reset yet and is locked.
		expect(
			screen.getByRole("heading", { level: 2, name: "Account type" }),
		).toBeTruthy();
		expect(nextButton().disabled).toBe(true);

		await act(async () => {
			pending.resolve();
		});

		await expectStep("personal");
		expect(inputValue("Name")).toBe("");
		expect(statuses().personal).toBe("active");
		expect(progressText()).toBe("0%");
		await waitFor(() => expect(nextButton().disabled).toBe(false));
	});
});
