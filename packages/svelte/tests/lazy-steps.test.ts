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
		const wizard = createWizardStore<D>({
			definition,
			initialData: { name: "" },
		});
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

	function twoStep(id: string, load: StepLoader<D>): WizardDefinition<D> {
		return {
			id,
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
	}

	it("store API: actions.preloadStep loads once; goNext reuses it", async () => {
		const load = vi.fn(async () => ({})) as unknown as StepLoader<D>;
		const wizard = createWizardStore<D>({
			definition: twoStep("svelte-store-preload", load),
			initialData: { name: "" },
		});
		const seen: boolean[] = [];
		const unsubscribe = wizard.loading.subscribe((l) =>
			seen.push(l.isLoadingStep),
		);

		await wizard.actions.preloadStep("b");
		expect(load).toHaveBeenCalledTimes(1);

		await wizard.goNext();
		expect(get(wizard).currentStepId).toBe("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(seen).not.toContain(true);
		unsubscribe();
	});

	it("store API: a failing actions.preloadStep resolves", async () => {
		const load = vi.fn(async () => {
			throw new Error("offline");
		}) as unknown as StepLoader<D>;
		const wizard = createWizardStore<D>({
			definition: twoStep("svelte-store-preload-fail", load),
			initialData: { name: "" },
		});

		await expect(wizard.actions.preloadStep("b")).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(1);
		expect(get(wizard.loading).isLoadingStep).toBe(false);
	});

	it("runes API: actions.preloadStep loads once; goNext reuses it", async () => {
		const load = vi.fn(async () => ({})) as unknown as StepLoader<D>;
		const wizard = createWizard<D>({
			definition: twoStep("svelte-runes-preload", load),
			initialData: { name: "" },
		});

		await wizard.actions.preloadStep("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);

		await wizard.goNext();
		expect(wizard.currentStepId).toBe("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);
	});

	it("runes API: a failing actions.preloadStep resolves", async () => {
		const load = vi.fn(async () => {
			throw new Error("offline");
		}) as unknown as StepLoader<D>;
		const wizard = createWizard<D>({
			definition: twoStep("svelte-runes-preload-fail", load),
			initialData: { name: "" },
		});

		await expect(wizard.actions.preloadStep("b")).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);
	});
});
