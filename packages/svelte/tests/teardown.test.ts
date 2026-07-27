import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore(autoDestroy?: boolean) {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		autoDestroy,
	});
}

describe("teardown", () => {
	it("T1: destroy() is idempotent", async () => {
		const wizard = makeStore();

		await expect(wizard.destroy()).resolves.toBeUndefined();
		await expect(wizard.destroy()).resolves.toBeUndefined();
	});

	it("T2: after destroy() the store is inert", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.destroy();
		expect(wizard.isDestroyed).toBe(true);

		const seen = vi.fn();
		const unsubscribe = wizard.subscribe(seen);
		expect(seen).toHaveBeenCalledTimes(1);

		await wizard.goNext().catch(() => {});
		await flush();

		expect(seen).toHaveBeenCalledTimes(1);
		expect(get(wizard).currentStepId).toBe("personal");
		unsubscribe();
	});

	it("T3: creating outside a component with autoDestroy on does not throw", () => {
		expect(() => makeStore()).not.toThrow();
	});

	it("T4: autoDestroy:false outside a component still allows manual destroy()", async () => {
		let wizard!: ReturnType<typeof makeStore>;
		expect(() => {
			wizard = makeStore(false);
		}).not.toThrow();

		await expect(wizard.destroy()).resolves.toBeUndefined();
		expect(wizard.isDestroyed).toBe(true);
	});
});
