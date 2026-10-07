import type { WizardDefinition } from "@gooonzick/wizard-core";
import {
	createLinearWizard,
	WizardNavigationError,
} from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import { createWizard } from "../src/runes/create-wizard.svelte";
import type { WizardStoreActions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

/**
 * A uniform view over both entry points so every scenario runs against the
 * classic store AND the runes wizard.
 */
interface Harness {
	actions: WizardStoreActions<SignupData>;
	goNext: () => Promise<void>;
	goBack: (steps?: number) => Promise<void>;
	currentStepId: () => string;
	data: () => SignupData;
	isNavigating: () => boolean;
	isValidating: () => boolean;
}

function storeHarness(definition: WizardDefinition<SignupData>): Harness {
	const wizard = createWizardStore<SignupData>({ definition, initialData });
	return {
		actions: wizard.actions,
		goNext: wizard.goNext,
		goBack: wizard.goBack,
		currentStepId: () => get(wizard).currentStepId,
		data: () => get(wizard).data,
		isNavigating: () => get(wizard.loading).isNavigating,
		isValidating: () => get(wizard.loading).isValidating,
	};
}

function runesHarness(definition: WizardDefinition<SignupData>): Harness {
	const wizard = createWizard<SignupData>({ definition, initialData });
	return {
		actions: wizard.actions,
		goNext: wizard.goNext,
		goBack: wizard.goBack,
		currentStepId: () => wizard.currentStepId,
		data: () => wizard.data,
		isNavigating: () => wizard.isNavigating,
		isValidating: () => wizard.isValidating,
	};
}

/**
 * A first step whose validator blocks every call on its own gate. `pending`
 * holds one resolver per blocked call, in call order.
 */
function gatedDefinition() {
	const pending: (() => void)[] = [];
	const definition = createLinearWizard<SignupData>({
		id: "gated",
		steps: [
			{
				id: "personal",
				validate: async () => {
					await new Promise<void>((resolve) => {
						pending.push(resolve);
					});
					return { valid: true };
				},
			},
			{ id: "plan" },
			{ id: "summary" },
		],
	});
	return {
		definition,
		pending,
		releaseAll: () => {
			for (const resolve of pending.splice(0)) resolve();
		},
	};
}

describe.each([
	["createWizardStore", storeHarness],
	["createWizard (runes)", runesHarness],
] as const)("%s: loading flags and reset baseline", (_name, make) => {
	it("L1: a busy-rejected second goNext keeps isNavigating true until the first settles", async () => {
		const { definition, releaseAll } = gatedDefinition();
		const wizard = make(definition);
		await flush();

		const first = wizard.goNext();
		const second = wizard.goNext();

		await expect(second).rejects.toBeInstanceOf(WizardNavigationError);
		await flush();
		// The rejected double click must not clear the in-flight flag.
		expect(wizard.isNavigating()).toBe(true);
		expect(wizard.currentStepId()).toBe("personal");

		releaseAll();
		await first;

		expect(wizard.isNavigating()).toBe(false);
		expect(wizard.currentStepId()).toBe("plan");
	});

	it("L2: overlapping validate() calls keep isValidating true until the last settles", async () => {
		const { definition, pending, releaseAll } = gatedDefinition();
		const wizard = make(definition);
		await flush();
		releaseAll();
		const before = pending.length;

		const first = wizard.actions.validate();
		const second = wizard.actions.validate();
		await flush();
		expect(pending.length).toBe(before + 2);
		expect(wizard.isValidating()).toBe(true);

		// Settle the SECOND call first: the first is still in flight.
		pending[before + 1]();
		await second;
		expect(wizard.isValidating()).toBe(true);

		releaseAll();
		await first;
		expect(wizard.isValidating()).toBe(false);
	});

	it("L3: reset(X) makes X the baseline for a later reset()", async () => {
		const wizard = make(createTestDefinition());
		await flush();
		const baseline: SignupData = { name: "ada", email: "a@b.c", plan: "pro" };

		wizard.actions.reset(baseline);
		await flush();
		expect(wizard.data()).toEqual(baseline);

		wizard.actions.updateField("name", "grace");
		await wizard.goNext();
		expect(wizard.currentStepId()).toBe("plan");

		wizard.actions.reset();
		await flush();

		expect(wizard.currentStepId()).toBe("personal");
		expect(wizard.data()).toEqual(baseline);
	});

	it("L5: goBack() with no argument goes back one step", async () => {
		const wizard = make(createTestDefinition());
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await wizard.goNext();
		expect(wizard.currentStepId()).toBe("summary");

		await wizard.goBack();

		expect(wizard.currentStepId()).toBe("plan");
		expect(wizard.isNavigating()).toBe(false);
	});

	it("L4: actions exposes exactly the WizardStoreActions keys", () => {
		const wizard = make(createTestDefinition());

		expect(Object.keys(wizard.actions).sort()).toEqual(
			[
				"updateData",
				"setData",
				"updateField",
				"validate",
				"validateAll",
				"canSubmit",
				"submit",
				"reset",
				"cancel",
				"serialize",
				"restore",
				"preloadStep",
			].sort(),
		);
	});
});
