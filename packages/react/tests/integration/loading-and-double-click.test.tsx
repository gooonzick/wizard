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
	bannerText,
	checkAgree,
	completeAccount,
	completePersonal,
	expectStep,
	flush,
	nextButton,
	stepStatus,
	typeInto,
} from "./helpers";

async function reachCompanyWithPendingSubmit(
	Component: (typeof variants)[number]["Component"],
	extraProps: Record<string, unknown> = {},
) {
	const submit = createDeferred();
	const companySubmit = vi.fn((_d: RegistrationData) => submit.promise);
	const onError = vi.fn<(e: Error) => void>();
	const onActionError = vi.fn<(e: unknown) => void>();
	render(
		<Component
			definition={createRegistrationWizard({ companySubmit })}
			onError={onError}
			onActionError={onActionError}
			{...extraProps}
		/>,
	);
	await completePersonal();
	await completeAccount("business");
	typeInto("Company", "Acme");
	await waitFor(() => {
		expect(nextButton().disabled).toBe(false);
		expect(nextButton().textContent).toBe("Next");
	});
	return { submit, companySubmit, onError, onActionError };
}

describe.each(variants)("double click on Next ($name)", ({ Component }) => {
	it("two clicks in the same frame: one navigation, busy rejection swallowed, loading kept", async () => {
		const { submit, companySubmit, onError, onActionError } =
			await reachCompanyWithPendingSubmit(Component);

		// Both clicks land before React re-renders the disabled button, so the
		// second one really reaches the machine and is rejected as busy.
		act(() => {
			fireEvent.click(nextButton());
			fireEvent.click(nextButton());
		});

		await waitFor(() =>
			expect(onActionError).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "WizardNavigationError",
					reason: "busy",
				}),
			),
		);
		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		await flush();
		await flush();

		// The rejected click must not clear the in-flight navigation's flag.
		expect(nextButton().disabled).toBe(true);
		expect(backButton().disabled).toBe(true);
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(bannerText()).toBe("");
		expect(onError).not.toHaveBeenCalledWith(
			expect.objectContaining({ reason: "busy" }),
		);
		expect(
			screen.getByRole("heading", { level: 2, name: "Company" }),
		).toBeTruthy();

		await act(async () => {
			submit.resolve();
		});

		// Exactly one step forward: review, not completed.
		await expectStep("review");
		expect(screen.queryByTestId("completion")).toBeNull();
		expect(stepStatus("review")).toBe("active");
		await waitFor(() => expect(nextButton().disabled).toBe(false));
		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(onActionError).toHaveBeenCalledTimes(1);
		expect(bannerText()).toBe("");
	});

	it("double-clicking Finish runs definition.onComplete once and completes once", async () => {
		const completing = createDeferred();
		const definitionOnComplete = vi.fn(
			(_d: RegistrationData) => completing.promise,
		);
		const onComplete = vi.fn();
		const onActionError = vi.fn<(e: unknown) => void>();
		render(
			<Component
				definition={createRegistrationWizard({
					onComplete: definitionOnComplete,
				})}
				onComplete={onComplete}
				onActionError={onActionError}
			/>,
		);
		await completePersonal();
		await completeAccount("personal");
		checkAgree();
		await waitFor(() => expect(nextButton().textContent).toBe("Finish"));

		act(() => {
			fireEvent.click(nextButton());
			fireEvent.click(nextButton());
		});
		await waitFor(() => expect(definitionOnComplete).toHaveBeenCalledTimes(1));
		expect(onActionError).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "busy" }),
		);
		expect(bannerText()).toBe("");

		await act(async () => {
			completing.resolve();
		});
		await screen.findByRole("heading", { name: "Registration complete" });
		expect(definitionOnComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("a second click after the re-render hits the disabled button and does nothing", async () => {
		const { submit, companySubmit, onActionError } =
			await reachCompanyWithPendingSubmit(Component);

		fireEvent.click(nextButton());
		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		expect(nextButton().disabled).toBe(true);
		fireEvent.click(nextButton());
		await flush();

		expect(companySubmit).toHaveBeenCalledTimes(1);
		expect(onActionError).not.toHaveBeenCalled();
		expect(nextButton().disabled).toBe(true);

		await act(async () => {
			submit.resolve();
		});
		await expectStep("review");
		await waitFor(() => expect(nextButton().disabled).toBe(false));
	});

	it("Cancel during a pending onSubmit returns to the first step and the stale submit neither navigates nor re-locks the UI", async () => {
		const onCancel = vi.fn();
		const { submit, companySubmit } = await reachCompanyWithPendingSubmit(
			Component,
			{ onCancel },
		);

		fireEvent.click(nextButton());
		await waitFor(() => expect(companySubmit).toHaveBeenCalledTimes(1));
		expect(nextButton().disabled).toBe(true);

		fireEvent.click(screen.getByTestId("cancel"));
		await expectStep("personal");
		expect(onCancel).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(nextButton().disabled).toBe(false));

		// The superseded onSubmit settles late: no navigation, flag not stolen.
		await act(async () => {
			submit.resolve();
		});
		await flush();
		expect(
			screen.getByRole("heading", { level: 2, name: "Personal details" }),
		).toBeTruthy();
		expect(nextButton().disabled).toBe(false);
		expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("");
		expect(bannerText()).toBe("");
	});
});
