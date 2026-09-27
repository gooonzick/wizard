import {
	createPersistencePlugin,
	type PersistencePlugin,
} from "@gooonzick/wizard-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	type AsyncMemoryAdapter,
	createAsyncMemoryAdapter,
	createMemoryAdapter,
	type MemoryAdapter,
	settle,
} from "./fixtures/async-helpers";
import {
	createRegistrationDefinition,
	type RegistrationData,
} from "./fixtures/registration-definition";
import {
	mountRegistration,
	type RegistrationPage,
	VARIANTS,
	type Variant,
} from "./fixtures/registration-ui";

type AdapterKind = "sync-load" | "async-load";

const pages: RegistrationPage[] = [];

afterEach(() => {
	for (const page of pages.splice(0)) {
		page.wrapper.unmount();
	}
});

const CASES = VARIANTS.flatMap((variant) =>
	(["sync-load", "async-load"] as AdapterKind[]).map(
		(kind) => [variant, kind] as const,
	),
);

function createAdapter(
	kind: AdapterKind,
): MemoryAdapter<RegistrationData> | AsyncMemoryAdapter<RegistrationData> {
	return kind === "sync-load"
		? createMemoryAdapter<RegistrationData>()
		: createAsyncMemoryAdapter<RegistrationData>();
}

/** Mounts with a FRESH plugin instance bound to the shared adapter. */
async function mountWithPersistence(
	variant: Variant,
	adapter: MemoryAdapter<RegistrationData>,
): Promise<{
	page: RegistrationPage;
	plugin: PersistencePlugin<RegistrationData>;
}> {
	const plugin = createPersistencePlugin<RegistrationData>({
		adapter,
		debounceMs: 0,
	});
	const page = await mountRegistration(variant, {
		definition: createRegistrationDefinition(),
		plugins: [plugin],
	});
	pages.push(page);
	return { page, plugin };
}

/** Async adapter: settle the pending load() BEFORE any user interaction. */
async function finishLoad(
	kind: AdapterKind,
	adapter: MemoryAdapter<RegistrationData>,
) {
	if (kind === "async-load") {
		const asyncAdapter = adapter as AsyncMemoryAdapter<RegistrationData>;
		expect(asyncAdapter.pendingLoads).toBe(1);
		asyncAdapter.resolveLoad();
	}
	await settle();
}

function unmountPage(page: RegistrationPage): void {
	page.wrapper.unmount();
	pages.splice(pages.indexOf(page), 1);
}

describe.each(
	CASES,
)("RegistrationWizard persistence (%s, %s)", (variant, kind) => {
	it("restores the step and field values on remount, and clears storage after completion", async () => {
		const adapter = createAdapter(kind);

		// ── first visit ──
		const first = await mountWithPersistence(variant, adapter);
		await finishLoad(kind, adapter);
		expect(await first.plugin.ready).toEqual({
			status: "skipped",
			reason: "empty",
		});

		await first.page.fillPersonal("Ada", "ada@example.com");
		await first.page.click("next");
		await first.page.chooseAccount("business");
		await settle();

		expect(adapter.stored?.state.currentStepId).toBe("account");
		expect(adapter.stored?.state.data).toMatchObject({
			name: "Ada",
			email: "ada@example.com",
			accountType: "business",
		});

		unmountPage(first.page);
		await settle();
		expect(adapter.stored).not.toBeNull();

		// ── second visit, same adapter ──
		const second = await mountWithPersistence(variant, adapter);
		if (kind === "async-load") {
			// Until the load resolves, the wizard shows its clean initial state.
			expect(second.page.currentStep()).toBe("personal");
			expect(second.page.inputValue("name")).toBe("");
		}
		await finishLoad(kind, adapter);

		const outcome = await second.plugin.ready;
		expect(outcome.status).toBe("restored");
		expect(second.page.currentStep()).toBe("account");
		expect(second.page.isChecked("account-business")).toBe(true);
		expect(second.page.status("personal")).toBe("completed");
		expect(second.page.status("account")).toBe("active");
		expect(second.page.isDisabled("back")).toBe(false);

		// The restored history makes Back land on the persisted personal step.
		await second.page.click("back");
		expect(second.page.currentStep()).toBe("personal");
		expect(second.page.inputValue("name")).toBe("Ada");
		expect(second.page.inputValue("email")).toBe("ada@example.com");

		// Finish the wizard: the stored record is cleared on completion.
		await second.page.click("next");
		await second.page.click("next");
		await second.page.type("company", "Acme");
		await second.page.click("next");
		await second.page.setAgree(true);
		await second.page.click("next");
		expect(second.page.isComplete()).toBe(true);
		await settle();
		expect(adapter.stored).toBeNull();
		expect(adapter.clears).toBeGreaterThan(0);

		// ── third visit: nothing to restore ──
		unmountPage(second.page);
		await settle();
		const third = await mountWithPersistence(variant, adapter);
		await finishLoad(kind, adapter);
		expect(await third.plugin.ready).toEqual({
			status: "skipped",
			reason: "empty",
		});
		expect(third.page.currentStep()).toBe("personal");
		expect(third.page.inputValue("name")).toBe("");
	});

	it("Reset clears the persisted record", async () => {
		const adapter = createAdapter(kind);
		const first = await mountWithPersistence(variant, adapter);
		await finishLoad(kind, adapter);

		await first.page.fillPersonal();
		await first.page.click("next");
		await settle();
		expect(adapter.stored?.state.currentStepId).toBe("account");

		await first.page.click("reset");
		await settle();
		expect(adapter.stored).toBeNull();
		expect(first.page.currentStep()).toBe("personal");
	});
});

describe.each(
	VARIANTS,
)("RegistrationWizard persistence async-load race (%s)", (variant) => {
	const kind: AdapterKind = "async-load";

	it("a late async load never overwrites what the user typed meanwhile", async () => {
		const adapter = createAdapter(kind);
		// Seed storage through a first visit that reaches the account step.
		const first = await mountWithPersistence(variant, adapter);
		await finishLoad(kind, adapter);
		await first.page.fillPersonal("Ada", "ada@example.com");
		await first.page.click("next");
		await settle();
		unmountPage(first.page);
		await settle();
		expect(adapter.stored?.state.currentStepId).toBe("account");

		// Second visit: the user types before the stored snapshot arrives.
		const second = await mountWithPersistence(variant, adapter);
		await second.page.type("name", "Grace");
		await finishLoad(kind, adapter);

		expect(await second.plugin.ready).toEqual({
			status: "skipped",
			reason: "stale",
		});
		expect(second.page.currentStep()).toBe("personal");
		expect(second.page.inputValue("name")).toBe("Grace");
		// The write suppressed while loading is released afterwards.
		expect(adapter.stored?.state.currentStepId).toBe("personal");
		expect(adapter.stored?.state.data.name).toBe("Grace");
	});
});
