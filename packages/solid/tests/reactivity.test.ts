import { createEffect, createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
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

const disposers: Array<() => void> = [];

/** Runs `fn` inside a tracked effect under a fresh root; disposed after each test. */
function track(fn: () => void): void {
	createRoot((dispose) => {
		disposers.push(dispose);
		createEffect(fn);
	});
}

afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

describe("reactivity", () => {
	it("X1: an effect on canGoNext re-runs after the async navigation compute", async () => {
		const wizard = makeWizard();
		const seen: boolean[] = [];
		track(() => {
			seen.push(wizard.canGoNext);
		});

		await flush();

		expect(seen).toEqual([false, true]);
	});

	it("X2: an effect never observes a half-applied transition (batch atomicity)", async () => {
		const wizard = makeWizard();
		await flush();
		wizard.actions.updateField("name", "ada");

		const seen: Array<[string, boolean]> = [];
		track(() => {
			seen.push([wizard.currentStepId, wizard.isFirstStep]);
		});

		await wizard.goNext();
		await flush();

		// Without batch(), the state signal is written before the navigation signal
		// and the effect sees the new step with the OLD isFirstStep.
		expect(seen).not.toContainEqual(["plan", true]);
		expect(seen.at(-1)).toEqual(["plan", false]);
	});

	it("X3: a loading-only change does not re-run an effect reading currentStepId", async () => {
		const wizard = makeWizard();
		await flush();

		let runs = 0;
		track(() => {
			void wizard.currentStepId;
			runs++;
		});
		const before = runs;

		wizard.getManager().setLoadingState({ isSubmitting: true });
		wizard.getManager().setLoadingState({ isSubmitting: false });

		expect(runs).toBe(before);
		expect(wizard.isSubmitting).toBe(false);
	});

	it("X4: a no-op updateField re-runs nothing", async () => {
		const wizard = makeWizard();
		await flush();

		let runs = 0;
		track(() => {
			void wizard.data.name;
			void wizard.canGoNext;
			void wizard.isValid;
			runs++;
		});
		const before = runs;

		wizard.actions.updateField("name", "");
		await flush();

		expect(runs).toBe(before);
	});

	it("X5: a data change re-runs an effect reading data", async () => {
		const wizard = makeWizard();
		await flush();

		const names: string[] = [];
		track(() => {
			names.push(wizard.data.name);
		});

		wizard.actions.updateField("name", "ada");

		expect(names).toEqual(["", "ada"]);
	});

	it("X6: re-entrancy — an effect that writes data on step entry leaves a consistent state", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		track(() => {
			if (wizard.currentStepId === "plan" && wizard.data.plan === "") {
				wizard.actions.updateField("plan", "pro");
			}
		});

		await wizard.goNext();
		await flush();

		expect(onError).not.toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("plan");
		expect(wizard.data.plan).toBe("pro");
		expect(wizard.data.name).toBe("ada");
		expect(wizard.getMachine().snapshot.data.plan).toBe("pro");
	});
});
