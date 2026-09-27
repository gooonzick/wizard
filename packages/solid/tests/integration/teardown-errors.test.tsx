import {
	createAnalyticsPlugin,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { Wizard } from "../../src/index";
import { flush } from "../helpers/flush";
import {
	alerts,
	choose,
	clickNextTo,
	fillPersonal,
	findHeading,
	nextButton,
	toggle,
	waitUntilEnabled,
} from "./fixtures/dom";
import {
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

function teardownProbes() {
	const destroy = vi.fn();
	const spyPlugin: WizardPlugin<RegistrationData> = { name: "spy", destroy };
	const onDropOff = vi.fn();
	const onWizardComplete = vi.fn();
	const analytics = createAnalyticsPlugin<RegistrationData>({
		onDropOff,
		onWizardComplete,
	});
	let wizard: Wizard<RegistrationData> | undefined;
	const onReady = (w: Wizard<RegistrationData>) => {
		wizard = w;
	};
	return {
		destroy,
		onDropOff,
		onWizardComplete,
		plugins: [spyPlugin, analytics],
		onReady,
		wizard: () => wizard,
	};
}

describe.each(VARIANTS)("unmount teardown (%s)", (variant) => {
	it("9a: unmounting mid-flow destroys the component-owned wizard and reports a drop-off", async () => {
		const probes = teardownProbes();
		const { unmount } = renderWizard(
			variant,
			{},
			{ plugins: probes.plugins, onReady: probes.onReady },
		);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		expect(probes.destroy).not.toHaveBeenCalled();

		unmount();
		await flush();

		expect(probes.destroy).toHaveBeenCalledTimes(1);
		expect(probes.onDropOff).toHaveBeenCalledTimes(1);
		expect(probes.onDropOff).toHaveBeenCalledWith(
			"account",
			expect.any(Number),
		);
		expect(probes.wizard()?.isDestroyed).toBe(true);
		expect(screen.queryByRole("heading")).toBeNull();
	});

	it("9b: unmounting a completed wizard destroys plugins without a drop-off", async () => {
		const probes = teardownProbes();
		const { unmount } = renderWizard(
			variant,
			{},
			{ plugins: probes.plugins, onReady: probes.onReady },
		);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		choose("Account type", "personal");
		await clickNextTo("Review");
		toggle("I agree to the terms");
		fireEvent.click(nextButton());
		await findHeading("Registration complete");
		// Plugin onComplete is dispatched fire-and-forget after the state commit.
		await waitFor(() => expect(probes.onWizardComplete).toHaveBeenCalled());

		unmount();
		await flush();

		expect(probes.destroy).toHaveBeenCalledTimes(1);
		expect(probes.onDropOff).not.toHaveBeenCalled();
		expect(probes.wizard()?.isDestroyed).toBe(true);
	});

	// complete() dispatches plugin onComplete synchronously BEFORE
	// events.onComplete, so an app that navigates away (unmount + autoDestroy)
	// inside its onComplete callback tears down plugins that already know the
	// wizard completed: analytics must not report a drop-off.
	it("9c: unmounting from the onComplete callback does not report a drop-off", async () => {
		const probes = teardownProbes();
		const onComplete = vi.fn();
		function Host() {
			const [open, setOpen] = createSignal(true);
			return (
				<Show when={open()} fallback={<p>Closed</p>}>
					<RegistrationWizard
						variant={variant}
						definition={createRegistrationDefinition()}
						plugins={probes.plugins}
						onComplete={(data) => {
							onComplete(data);
							setOpen(false); // "navigate away" on completion
						}}
					/>
				</Show>
			);
		}
		render(() => <Host />);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		choose("Account type", "personal");
		await clickNextTo("Review");
		toggle("I agree to the terms");
		fireEvent.click(nextButton());
		await screen.findByText("Closed");
		await flush();

		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(probes.destroy).toHaveBeenCalledTimes(1);
		expect(probes.onDropOff).not.toHaveBeenCalled();
		expect(probes.onWizardComplete).toHaveBeenCalledTimes(1);
	});
});

describe.each(VARIANTS)("error surfacing (%s)", (variant) => {
	it("10a: a throwing guard reaches onError and the error area without crashing the UI", async () => {
		const onError = vi.fn();
		renderWizard(
			variant,
			{
				companyEnabled: (data) => {
					if (data.accountType === "business") {
						throw new Error("guard exploded");
					}
					return false;
				},
			},
			{ onError },
		);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		expect(onError).not.toHaveBeenCalled();

		// The async navigation recompute evaluates the guard.
		choose("Account type", "business");
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "guard exploded" }),
			),
		);
		expect(alerts()).toContain("guard exploded");

		// A Next that hits the guard is reported and leaves the user in place.
		onError.mockClear();
		await waitUntilEnabled(nextButton());
		fireEvent.click(nextButton());
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "guard exploded" }),
			),
		);
		await waitUntilEnabled(nextButton());
		expect(screen.getByRole("heading").textContent).toBe("Account");
		expect(alerts()).toContain("guard exploded");

		// Recovering is possible: the personal branch never evaluates the throw.
		choose("Account type", "personal");
		await clickNextTo("Review");
		expect(alerts()).toEqual([]);
	});

	it("10b: a user effect throwing on a state change goes to onError; the UI keeps working", async () => {
		const onError = vi.fn();
		const onComplete = vi.fn();
		renderWizard(
			variant,
			{},
			{ onError, onComplete, throwInEffectOn: "review" },
		);
		await findHeading("Personal");
		fillPersonal();
		await clickNextTo("Account");
		choose("Account type", "personal");
		expect(onError).not.toHaveBeenCalled();

		// The effect throws inside the binding's batch(); no <ErrorBoundary>, so
		// createWizard's try/catch routes it to onError instead of rejecting.
		await clickNextTo("Review");
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "effect boom" }),
		);
		expect(alerts()).toEqual(["effect boom"]);
		expect(nextButton().textContent).toBe("Finish");

		toggle("I agree to the terms");
		fireEvent.click(nextButton());
		await findHeading("Registration complete");
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
