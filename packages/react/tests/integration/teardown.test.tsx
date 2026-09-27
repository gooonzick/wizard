import {
	createAnalyticsPlugin,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { variants } from "./components";
import {
	createRegistrationWizard,
	type RegistrationData,
} from "./fixtures/registration-wizard";
import {
	checkAgree,
	clickPrimary,
	completeAccount,
	completePersonal,
	flush,
} from "./helpers";

function setup() {
	let clock = 1_000;
	const destroy = vi.fn();
	const onDropOff = vi.fn<(stepId: string, durationMs: number) => void>();
	const analytics = createAnalyticsPlugin<RegistrationData>({
		onDropOff,
		now: () => clock,
	});
	const plugins: WizardPlugin<RegistrationData>[] = [
		{ name: "spy", destroy },
		analytics,
	];
	return {
		destroy,
		onDropOff,
		plugins,
		setClock: (value: number) => {
			clock = value;
		},
	};
}

// Not wrapped in StrictMode: its mount -> unmount -> remount probe destroys a
// discarded manager, which would add an extra (expected) destroy() call.
describe.each(variants)("unmount teardown ($name)", ({ Component }) => {
	it("destroys plugins on unmount and reports a drop-off on the current step", async () => {
		const { destroy, onDropOff, plugins, setClock } = setup();
		const { unmount } = render(
			<Component definition={createRegistrationWizard()} plugins={plugins} />,
		);

		await completePersonal();
		expect(destroy).not.toHaveBeenCalled();
		setClock(4_000);

		unmount();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(onDropOff).toHaveBeenCalledTimes(1);
		expect(onDropOff).toHaveBeenCalledWith("account", 3_000);
	});

	it("destroys plugins after completion without reporting a drop-off", async () => {
		const { destroy, onDropOff, plugins } = setup();
		const { unmount } = render(
			<Component definition={createRegistrationWizard()} plugins={plugins} />,
		);

		await completePersonal();
		await completeAccount("personal");
		checkAgree();
		await clickPrimary("Finish");
		await screen.findByRole("heading", { name: "Registration complete" });

		unmount();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(onDropOff).not.toHaveBeenCalled();
	});

	it("does not report a drop-off when the app unmounts inside onComplete", async () => {
		const { destroy, onDropOff, plugins } = setup();
		let unmountApp = () => {};
		const onComplete = vi.fn(() => unmountApp());
		const { unmount } = render(
			<Component
				definition={createRegistrationWizard()}
				plugins={plugins}
				onComplete={onComplete}
			/>,
		);
		unmountApp = unmount;

		await completePersonal();
		await completeAccount("personal");
		checkAgree();
		await clickPrimary("Finish");
		await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
		await flush();

		// Plugins learn about completion before events.onComplete, so the
		// teardown triggered from it is not a drop-off.
		expect(screen.queryByTestId("next")).toBeNull();
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(onDropOff).not.toHaveBeenCalled();
	});
});
