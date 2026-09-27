import {
	createPersistencePlugin,
	type PersistenceRestoreOutcome,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { maybeStrict, variants } from "./components";
import {
	createMemoryAdapter,
	createRegistrationWizard,
	type MemoryAdapter,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	checkAgree,
	clickBack,
	clickPrimary,
	completeAccount,
	completePersonal,
	expectStep,
	flush,
	statuses,
	typeInto,
} from "./helpers";

const inputValue = (label: string) =>
	screen.getByLabelText<HTMLInputElement | HTMLSelectElement>(label).value;

function setup(mode: "sync" | "async") {
	const adapter = createMemoryAdapter(mode);
	const plugin = createPersistencePlugin<RegistrationData>({
		adapter,
		debounceMs: 0,
	});
	// Reference-stable across both mounts: the SAME plugin instance is reused.
	const plugins: WizardPlugin<RegistrationData>[] = [plugin];
	const definition = createRegistrationWizard({
		companySubmit: async () => {},
	});
	return { adapter, plugin, plugins, definition };
}

/** First session: personal -> account(business) -> company, type a company. */
async function progressAndPersist(adapter: MemoryAdapter): Promise<void> {
	await completePersonal();
	await completeAccount("business");
	typeInto("Company", "Acme");
	await waitFor(() => {
		expect(adapter.stored()?.state.currentStepId).toBe("company");
		expect(adapter.stored()?.state.data.company).toBe("Acme");
	});
}

/** Drives the restored wizard to completion and checks the record is gone. */
async function finishAndExpectCleared(adapter: MemoryAdapter): Promise<void> {
	await clickPrimary("Next");
	await expectStep("review");
	checkAgree();
	await clickPrimary("Finish");
	await screen.findByRole("heading", { name: "Registration complete" });
	await waitFor(() => expect(adapter.stored()).toBeNull());
	expect(adapter.clears).toBeGreaterThanOrEqual(1);
}

describe.each(variants)("persistence plugin ($name)", ({ Component }) => {
	it.each([
		{ strict: false, mode: "plain" },
		{ strict: true, mode: "StrictMode" },
	])("sync adapter: remount restores the saved step and field values on the first render ($mode)", async ({
		strict,
	}) => {
		const { adapter, plugins, definition } = setup("sync");

		const first = render(
			maybeStrict(
				<Component definition={definition} plugins={plugins} />,
				strict,
			),
		);
		await progressAndPersist(adapter);
		first.unmount();
		await flush();
		expect(adapter.stored()?.state.currentStepId).toBe("company");

		render(
			maybeStrict(
				<Component definition={definition} plugins={plugins} />,
				strict,
			),
		);

		// Synchronous load: restored inside the machine constructor, so the very
		// first committed render is already on the saved step.
		expect(
			screen.getByRole("heading", { level: 2, name: "Company" }),
		).toBeTruthy();
		expect(inputValue("Company")).toBe("Acme");
		expect(statuses()).toMatchObject({
			personal: "completed",
			account: "completed",
			company: "active",
		});

		// Restored history drives Back.
		await clickBack();
		await expectStep("account");
		expect(inputValue("Account type")).toBe("business");
		await clickBack();
		await expectStep("personal");
		expect(inputValue("Name")).toBe("Ada Lovelace");
		expect(inputValue("Email")).toBe("ada@example.com");

		await clickPrimary("Next");
		await expectStep("account");
		await clickPrimary("Next");
		await expectStep("company");
		await finishAndExpectCleared(adapter);
	});

	it.each([
		{ strict: false, mode: "plain" },
		{ strict: true, mode: "StrictMode" },
	])("async adapter: plugin.ready resolves 'restored' and the UI follows ($mode)", async ({
		strict,
	}) => {
		const { adapter, plugin, plugins, definition } = setup("async");

		const first = render(
			maybeStrict(
				<Component definition={definition} plugins={plugins} />,
				strict,
			),
		);
		let firstOutcome: PersistenceRestoreOutcome<RegistrationData> | undefined;
		await act(async () => {
			firstOutcome = await plugin.ready;
		});
		expect(firstOutcome).toEqual({ status: "skipped", reason: "empty" });

		await progressAndPersist(adapter);
		first.unmount();
		await flush();

		render(
			maybeStrict(
				<Component definition={definition} plugins={plugins} />,
				strict,
			),
		);
		// Read AFTER render: under StrictMode the probe's deferred settled as
		// "destroyed" and onInit re-armed a fresh one for the live manager.
		let outcome: PersistenceRestoreOutcome<RegistrationData> | undefined;
		await act(async () => {
			outcome = await plugin.ready;
		});
		expect(outcome?.status).toBe("restored");

		await expectStep("company");
		expect(inputValue("Company")).toBe("Acme");
		expect(statuses()).toMatchObject({
			personal: "completed",
			account: "completed",
			company: "active",
		});

		await finishAndExpectCleared(adapter);
	});

	it("Reset clears the stored record, so a remount starts fresh", async () => {
		const { adapter, plugins, definition } = setup("sync");
		const first = render(
			<Component definition={definition} plugins={plugins} />,
		);
		await progressAndPersist(adapter);

		fireEvent.click(screen.getByTestId("reset"));
		await expectStep("personal");
		await waitFor(() => expect(adapter.stored()).toBeNull());
		first.unmount();
		await flush();

		render(<Component definition={definition} plugins={plugins} />);
		expect(
			screen.getByRole("heading", { level: 2, name: "Personal details" }),
		).toBeTruthy();
		expect(inputValue("Name")).toBe("");
	});
});
