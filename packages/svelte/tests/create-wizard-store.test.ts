import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import type { WizardSnapshot } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore(overrides: { onError?: (e: Error) => void } = {}) {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...overrides,
	});
}

describe("createWizardStore", () => {
	it("S1: invokes the subscriber synchronously with a defined value", () => {
		const wizard = makeStore();
		let firedBeforeReturn = false;
		let value: WizardSnapshot<SignupData> | undefined;

		let returned = false;
		const unsubscribe = wizard.subscribe((v) => {
			if (!returned) firedBeforeReturn = true;
			value = v;
		});
		returned = true;

		expect(firedBeforeReturn).toBe(true);
		expect(value).toBeDefined();
		expect(value?.currentStepId).toBe("personal");
		unsubscribe();
	});

	it("S2: initial value carries the documented navigation-cache quirk", () => {
		const wizard = makeStore();
		const value = get(wizard);

		expect(value.currentStepId).toBe("personal");
		expect(value.data).toEqual(initialData);
		expect(value.isFirstStep).toBe(true);
		// Documented quirk (§9.3): the manager seeds a pessimistic navigation cache.
		expect(value.canGoNext).toBe(false);
		expect(value.isLastStep).toBe(true);
	});

	it("S3: navigation flags settle after a flush", async () => {
		const wizard = makeStore();
		await flush();
		const value = get(wizard);

		expect(value.canGoNext).toBe(true);
		expect(value.isLastStep).toBe(false);
		expect(value.availableSteps.length).toBeGreaterThan(0);
	});

	it("S4: goNext() advances and grows history/visited", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goNext();

		const value = get(wizard);
		expect(value.currentStepId).toBe("plan");
		expect(value.stepHistory).toEqual(["personal", "plan"]);
		expect(value.visitedSteps).toContain("plan");
	});

	it("S5: goPrevious() returns to the first step", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		await wizard.goPrevious();

		expect(get(wizard).currentStepId).toBe("personal");
	});

	it("S6: goTo() navigates, and skipValidation bypasses an invalid step", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");

		await wizard.goTo("summary");
		expect(get(wizard).currentStepId).toBe("summary");

		// Back to an invalid `personal` and jump out of it with skipValidation.
		const invalid = makeStore();
		await flush();
		await expect(invalid.goTo("summary")).rejects.toThrow();
		expect(get(invalid).currentStepId).toBe("personal");

		await invalid.goTo("summary", { skipValidation: true });
		expect(get(invalid).currentStepId).toBe("summary");
	});

	it("S7: deprecated goBack()/goToStep() still work", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		await wizard.goBack(1);
		expect(get(wizard).currentStepId).toBe("personal");

		await wizard.goToStep("summary");
		expect(get(wizard).currentStepId).toBe("summary");
	});

	it("S8: two independent subscribers both see the first emit and updates", async () => {
		const wizard = makeStore();
		const a = vi.fn();
		const b = vi.fn();

		const unsubA = wizard.subscribe(a);
		const unsubB = wizard.subscribe(b);
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);

		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();

		expect(a.mock.calls.length).toBeGreaterThan(1);
		expect(b.mock.calls.length).toBeGreaterThan(1);
		expect(a.mock.calls.at(-1)?.[0].currentStepId).toBe("plan");
		expect(b.mock.calls.at(-1)?.[0].currentStepId).toBe("plan");

		unsubA();
		unsubB();
	});

	it("S9: the aggregate value is reference-stable across a no-op notify", async () => {
		const wizard = makeStore();
		await flush();

		const values: WizardSnapshot<SignupData>[] = [];
		const unsubscribe = wizard.subscribe((v) => values.push(v));

		// "loading" notifies do not rebuild any of the four slice caches, so the
		// memoised aggregate must be handed out unchanged.
		wizard.getManager().notifySubscribers(["loading"]);

		expect(values).toHaveLength(2);
		expect(values[1]).toBe(values[0]);
		unsubscribe();
	});

	it("S10: the machine outlives a drop to zero subscribers", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");

		const unsubscribe = wizard.subscribe(() => {});
		unsubscribe();

		await wizard.goNext();

		expect(wizard.isDestroyed).toBe(false);
		let seen: WizardSnapshot<SignupData> | undefined;
		wizard.subscribe((v) => {
			seen = v;
		})();
		expect(seen?.currentStepId).toBe("plan");
	});

	it("S11: exposes the live machine and manager", () => {
		const wizard = makeStore();

		expect(wizard.getMachine()).toBe(wizard.getManager().getMachine());
		expect(wizard.getManager().getInitialStepId()).toBe("personal");
	});
});
