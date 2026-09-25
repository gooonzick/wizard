import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions, Wizard } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(options: Partial<CreateWizardOptions<SignupData>> = {}) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("teardown", () => {
	it("T1: disposing the owning root destroys the wizard and its plugins", async () => {
		const destroyPlugin = vi.fn();
		let wizard!: Wizard<SignupData>;
		const dispose = createRoot((d) => {
			wizard = makeWizard({ plugins: [{ name: "p", destroy: destroyPlugin }] });
			return d;
		});
		await flush();

		dispose();
		expect(wizard.isDestroyed).toBe(true);
		await flush();
		expect(destroyPlugin).toHaveBeenCalledTimes(1);
	});

	it("T2: autoDestroy:false keeps the wizard alive after the root is disposed", async () => {
		let wizard!: Wizard<SignupData>;
		const dispose = createRoot((d) => {
			wizard = makeWizard({ autoDestroy: false });
			return d;
		});

		dispose();
		await flush();

		expect(wizard.isDestroyed).toBe(false);
		await wizard.destroy();
		expect(wizard.isDestroyed).toBe(true);
	});

	it("T3: creating without an owner registers nothing and logs no warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const wizard = makeWizard();
			expect(wizard.isDestroyed).toBe(false);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it("T4: destroy() is idempotent", async () => {
		const destroyPlugin = vi.fn();
		const wizard = makeWizard({
			plugins: [{ name: "p", destroy: destroyPlugin }],
		});

		await expect(wizard.destroy()).resolves.toBeUndefined();
		await expect(wizard.destroy()).resolves.toBeUndefined();
		await flush();

		expect(destroyPlugin).toHaveBeenCalledTimes(1);
	});

	it("T5: after destroy() the signals stop following the manager", async () => {
		const wizard = makeWizard();
		await flush();

		await wizard.destroy();
		// destroy() cleared the manager's subscribers and the manager ignores
		// post-destroy writes; the observable guarantee is that signals stay put.
		const manager = wizard.getManager();
		expect(manager.isDestroyed).toBe(true);
		manager.setLoadingState({ isSubmitting: true });

		expect(wizard.isSubmitting).toBe(false);
		expect(wizard.currentStepId).toBe("personal");
	});
});
