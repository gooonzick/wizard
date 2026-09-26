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

	it("T5: after destroy() the binding stops following the machine", async () => {
		const wizard = makeWizard();
		await flush();

		await wizard.destroy();
		expect(wizard.isDestroyed).toBe(true);

		// core's destroy() only tears down plugins: the machine itself still
		// accepts writes. The binding must no longer mirror them.
		let accepted = true;
		try {
			wizard.getMachine().updateField("name", "x");
		} catch {
			accepted = false;
		}
		await flush();

		expect(wizard.data.name).toBe("");
		if (accepted) {
			// Proves the write really happened below the binding.
			expect(wizard.getMachine().snapshot.data.name).toBe("x");
		}
	});
});
