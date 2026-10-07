import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import { flush } from "./helpers/flush";

type D = { name: string };

describe("solid — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep (flat + loading slice) and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<object>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "solid-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		const wizard = createWizard<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(wizard.isLoadingStep).toBe(true);
		expect(wizard.loading.isLoadingStep).toBe(true);

		release();
		await nav;
		expect(wizard.isLoadingStep).toBe(false);
		expect(wizard.currentStepId).toBe("b");
		await wizard.destroy();
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

	it("actions.preloadStep loads once in the background; goNext reuses it", async () => {
		const load = vi.fn(async () => ({})) as unknown as StepLoader<D>;
		const wizard = createWizard<D>({
			definition: twoStep("solid-preload", load),
			initialData: { name: "" },
		});

		await wizard.actions.preloadStep("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);

		await wizard.goNext();
		expect(wizard.currentStepId).toBe("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);
		await wizard.destroy();
	});

	it("a failing actions.preloadStep resolves", async () => {
		const load = vi.fn(async () => {
			throw new Error("offline");
		}) as unknown as StepLoader<D>;
		const wizard = createWizard<D>({
			definition: twoStep("solid-preload-fail", load),
			initialData: { name: "" },
		});

		await expect(wizard.actions.preloadStep("b")).resolves.toBeUndefined();
		expect(load).toHaveBeenCalledTimes(1);
		expect(wizard.isLoadingStep).toBe(false);
		await wizard.destroy();
	});
});
