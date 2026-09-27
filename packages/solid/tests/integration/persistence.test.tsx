import {
	createPersistencePlugin,
	type PersistencePlugin,
} from "@gooonzick/wizard-core";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { flush } from "../helpers/flush";
import {
	choose,
	clickBackTo,
	clickNextTo,
	fillPersonal,
	findHeading,
	inputValue,
	nextButton,
	stepStatus,
	toggle,
} from "./fixtures/dom";
import {
	createMemoryAdapter,
	type MemoryAdapter,
} from "./fixtures/memory-adapter";
import {
	createRegistrationDefinition,
	type RegistrationData,
} from "./fixtures/registration";
import {
	RegistrationWizard,
	VARIANTS,
	type Variant,
} from "./fixtures/registration-wizard";

function mount(
	variant: Variant,
	adapter: MemoryAdapter<RegistrationData>,
): { plugin: PersistencePlugin<RegistrationData>; unmount: () => void } {
	// A fresh plugin per mount, like an app that builds it next to createWizard.
	const plugin = createPersistencePlugin<RegistrationData>({
		adapter,
		debounceMs: 0,
	});
	const { unmount } = render(() => (
		<RegistrationWizard
			variant={variant}
			definition={createRegistrationDefinition()}
			plugins={[plugin]}
		/>
	));
	return { plugin, unmount };
}

/** First session: fill personal, move to account, then unmount. */
async function firstSession(
	variant: Variant,
	adapter: MemoryAdapter<RegistrationData>,
): Promise<void> {
	const { plugin, unmount } = mount(variant, adapter);
	adapter.releaseLoads();
	expect(await plugin.ready).toEqual({ status: "skipped", reason: "empty" });

	await findHeading("Personal");
	fillPersonal("Ada", "ada@example.com");
	await clickNextTo("Account");
	await flush();
	expect(adapter.stored?.state.currentStepId).toBe("account");
	expect(adapter.stored?.state.data.name).toBe("Ada");

	unmount();
	await flush();
	expect(screen.queryByRole("heading")).toBeNull();
}

/** Completes the restored wizard and checks that storage is cleared. */
async function finishAndExpectCleared(
	adapter: MemoryAdapter<RegistrationData>,
): Promise<void> {
	await clickNextTo("Account");
	choose("Account type", "personal");
	await clickNextTo("Review");
	toggle("I agree to the terms");
	fireEvent.click(nextButton());
	await findHeading("Registration complete");
	await waitFor(() => expect(adapter.clear).toHaveBeenCalled());
	expect(adapter.stored).toBeNull();
}

describe.each(VARIANTS)("persistence plugin (%s)", (variant) => {
	it("8a: sync adapter — a remount restores the step and values; completion clears storage", async () => {
		const adapter = createMemoryAdapter<RegistrationData>("sync");
		await firstSession(variant, adapter);

		const { plugin } = mount(variant, adapter);
		// Sync load: restored inside the machine constructor, so the FIRST paint
		// is already the saved step.
		expect(screen.getByRole("heading").textContent).toBe("Account");
		expect(stepStatus("personal")).toBe("completed");
		const outcome = await plugin.ready;
		expect(outcome.status).toBe("restored");

		// History was restored too: Back works and shows the saved values.
		await clickBackTo("Personal");
		expect(inputValue("Name")).toBe("Ada");
		expect(inputValue("Email")).toBe("ada@example.com");

		await finishAndExpectCleared(adapter);
	});

	it("8b: async adapter — the restore lands after load resolves; await plugin.ready observes it", async () => {
		const adapter = createMemoryAdapter<RegistrationData>("async");
		await firstSession(variant, adapter);

		const { plugin } = mount(variant, adapter);
		// Nothing loaded yet: the wizard starts clean.
		await findHeading("Personal");
		expect(inputValue("Name")).toBe("");

		adapter.releaseLoads();
		const outcome = await plugin.ready;
		expect(outcome.status).toBe("restored");
		await findHeading("Account");
		expect(stepStatus("personal")).toBe("completed");

		await clickBackTo("Personal");
		expect(inputValue("Name")).toBe("Ada");
		expect(inputValue("Email")).toBe("ada@example.com");

		await finishAndExpectCleared(adapter);
	});
});
