import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import type {
	WizardStoreLoading,
	WizardStoreNavigation,
	WizardStoreState,
	WizardStoreValidation,
} from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore() {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
	});
}

describe("channel sub-stores", () => {
	it("C1: every sub-store emits synchronously on subscribe", () => {
		const wizard = makeStore();

		let state: WizardStoreState<SignupData> | undefined;
		let validation: WizardStoreValidation | undefined;
		let navigation: WizardStoreNavigation | undefined;
		let loading: WizardStoreLoading | undefined;

		wizard.state.subscribe((v) => {
			state = v;
		})();
		wizard.validation.subscribe((v) => {
			validation = v;
		})();
		wizard.navigation.subscribe((v) => {
			navigation = v;
		})();
		wizard.loading.subscribe((v) => {
			loading = v;
		})();

		expect(state?.currentStepId).toBe("personal");
		expect(validation?.isValid).toBe(true);
		expect(navigation?.isFirstStep).toBe(true);
		expect(loading).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
			isLoadingStep: false,
		});
	});

	it("C2: loading toggles isNavigating true then false across goNext()", async () => {
		const wizard = makeStore();
		await flush();
		wizard.actions.updateField("name", "ada");

		const seen: boolean[] = [];
		const unsubscribe = wizard.loading.subscribe((v) =>
			seen.push(v.isNavigating),
		);

		await wizard.goNext();
		unsubscribe();

		expect(seen).toContain(true);
		expect(seen.at(-1)).toBe(false);
		expect(seen.indexOf(true)).toBeLessThan(seen.length - 1);
	});

	it("C3: a loading-only change does not emit on the state store", () => {
		const wizard = makeStore();
		const onState = vi.fn();
		const unsubscribe = wizard.state.subscribe(onState);
		expect(onState).toHaveBeenCalledTimes(1);

		wizard.getManager().setLoadingState({ isValidating: true });

		expect(onState).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("C4: reset/cancel/restore go through the manager, keeping loading in sync", async () => {
		const wizard = makeStore();
		await flush();

		let last: WizardStoreLoading | undefined;
		const unsubscribe = wizard.loading.subscribe((v) => {
			last = v;
		});

		wizard.actions.reset();
		await flush();
		expect(last).toBe(wizard.getManager().getLoadingSnapshot());

		await wizard.actions.cancel();
		expect(last).toBe(wizard.getManager().getLoadingSnapshot());

		wizard.actions.restore(wizard.actions.serialize());
		await flush();
		expect(last).toBe(wizard.getManager().getLoadingSnapshot());

		expect(last).toEqual({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
			isLoadingStep: false,
		});
		unsubscribe();
	});
});
