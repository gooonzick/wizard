import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import { createWizard } from "../src/runes/create-wizard.svelte";
import { flush } from "./helpers/flush";

type D = { name: string };

function lazyDefinition() {
	let release!: () => void;
	const load = vi.fn(
		() =>
			new Promise<object>((resolve) => {
				release = () => resolve({});
			}),
	) as unknown as StepLoader<D>;
	const definition: WizardDefinition<D> = {
		id: "svelte-lazy",
		initialStepId: "a",
		steps: {
			a: { id: "a", next: { type: "static", to: "b" } },
			b: { id: "b", load },
		},
	};
	return { definition, release: () => release() };
}

describe("svelte — lazy steps (WIZ-013)", () => {
	it("store API: loading.isLoadingStep and $wizard.isLoadingStep", async () => {
		const { definition, release } = lazyDefinition();
		const wizard = createWizardStore<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(get(wizard.loading).isLoadingStep).toBe(true);
		expect(get(wizard).isLoadingStep).toBe(true);

		release();
		await nav;
		expect(get(wizard.loading).isLoadingStep).toBe(false);
	});

	it("runes API: flat isLoadingStep getter", async () => {
		const { definition, release } = lazyDefinition();
		const wizard = createWizard<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(wizard.isLoadingStep).toBe(true);

		release();
		await nav;
		expect(wizard.isLoadingStep).toBe(false);
		expect(wizard.currentStepId).toBe("b");
	});
});
