import {
	createAnalyticsPlugin,
	createPersistencePlugin,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import { flush } from "../helpers/flush";
import {
	check,
	choose,
	click,
	createMemoryAdapter,
	deferred,
	expectStep,
	input,
	type MemoryAdapter,
	reachAccount,
	reachReviewPersonal,
	select,
	stepStatus,
	type,
} from "./harness";
import {
	createRegistrationDefinition,
	type RegistrationData,
} from "./registration";
import { type Variant, variants } from "./variants";

const persistence = (adapter: MemoryAdapter) =>
	createPersistencePlugin<RegistrationData>({ adapter, debounceMs: 0 });

function mount(variant: Variant, plugins: WizardPlugin<RegistrationData>[]) {
	return render(variant.Component, {
		props: { definition: createRegistrationDefinition(), plugins },
	});
}

/** First session: reach `account`, pick "business", then unmount. */
async function seedSession(variant: Variant, adapter: MemoryAdapter) {
	const plugin = persistence(adapter);
	const view = mount(variant, [plugin]);
	expect(await plugin.ready).toEqual({ status: "skipped", reason: "empty" });

	await reachAccount();
	await choose("Account type", "business");
	await flush();

	expect(adapter.record?.state.currentStepId).toBe("account");
	expect(adapter.record?.state.data).toMatchObject({
		name: "Ada Lovelace",
		email: "ada@example.com",
		accountType: "business",
	});

	view.unmount();
	await flush();
}

/** Asserts the UI shows the session seeded by `seedSession`. */
async function expectRestoredSession() {
	await expectStep("account");
	expect(select("Account type").value).toBe("business");
	expect(stepStatus("personal")).toBe("completed");

	// The restored history drives Back.
	await click("Back");
	await expectStep("personal");
	expect(input("Name").value).toBe("Ada Lovelace");
	expect(input("Email").value).toBe("ada@example.com");
}

describe.each(variants)("registration plugins — $name", (variant) => {
	it("8a. persistence (sync adapter): a remount restores step + values; completion clears storage", async () => {
		const adapter = createMemoryAdapter();
		await seedSession(variant, adapter);

		const plugin = persistence(adapter);
		mount(variant, [plugin]);
		// Sync load is applied during construction: no flash of the first step.
		expect(screen.getByTestId("current-step").textContent).toBe("account");
		expect(await plugin.ready).toMatchObject({ status: "restored" });
		await expectRestoredSession();

		// Finish the business branch; completion clears the record.
		await click("Next");
		await expectStep("account");
		await click("Next");
		await expectStep("company");
		await type("Company", "Acme Ltd");
		await click("Next");
		await expectStep("review");
		await check("I agree to the terms");
		await click("Finish");
		await screen.findByText("Registration complete");
		await flush();
		expect(adapter.record).toBeNull();
	});

	it("8b. persistence (async adapter): the first step shows until load resolves, then the session is restored", async () => {
		const adapter = createMemoryAdapter();
		await seedSession(variant, adapter);

		const load = deferred<MemoryAdapter["record"]>();
		adapter.pendingLoad = load;
		const plugin = persistence(adapter);
		mount(variant, [plugin]);

		let settled = false;
		void plugin.ready.then(() => {
			settled = true;
		});
		await flush();
		expect(settled).toBe(false);
		expect(screen.getByTestId("current-step").textContent).toBe("personal");
		expect(input("Name").value).toBe("");

		load.resolve(adapter.record);
		expect(await plugin.ready).toMatchObject({ status: "restored" });
		await expectRestoredSession();
	});

	it("8c. persistence: a completed session is not restored on the next mount", async () => {
		const adapter = createMemoryAdapter();
		const first = persistence(adapter);
		const view = mount(variant, [first]);
		await reachReviewPersonal();
		await check("I agree to the terms");
		await click("Finish");
		await screen.findByText("Registration complete");
		await flush();
		expect(adapter.record).toBeNull();
		view.unmount();
		await flush();

		const second = persistence(adapter);
		mount(variant, [second]);
		expect(await second.ready).toEqual({ status: "skipped", reason: "empty" });
		await expectStep("personal");
		expect(input("Name").value).toBe("");
	});

	it("9a. unmount tears the wizard down: plugin destroy + analytics onDropOff on the current step", async () => {
		let clock = 1_000;
		const onDropOff = vi.fn();
		const destroy = vi.fn();
		const analytics = createAnalyticsPlugin<RegistrationData>({
			onDropOff,
			now: () => clock,
		});
		const view = mount(variant, [{ name: "probe", destroy }, analytics]);

		await reachAccount();
		clock = 6_000;
		view.unmount();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(onDropOff).toHaveBeenCalledTimes(1);
		expect(onDropOff).toHaveBeenCalledWith("account", 5_000);
	});

	it("9b. unmount after completion tears down without reporting a drop-off", async () => {
		const onDropOff = vi.fn();
		const onWizardComplete = vi.fn();
		const destroy = vi.fn();
		const analytics = createAnalyticsPlugin<RegistrationData>({
			onDropOff,
			onWizardComplete,
		});
		const view = mount(variant, [{ name: "probe", destroy }, analytics]);

		await reachReviewPersonal();
		await check("I agree to the terms");
		await click("Finish");
		await screen.findByText("Registration complete");
		await flush();
		expect(onWizardComplete).toHaveBeenCalledTimes(1);

		view.unmount();
		await flush();
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(onDropOff).not.toHaveBeenCalled();
	});
});
