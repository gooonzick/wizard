import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

type D = { name: string };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useWizard (vue) — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep while a lazy step loads, and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<object>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "vue-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		let wizard!: UseWizardReturn<D>;
		mount(
			defineComponent({
				setup() {
					wizard = useWizard({ definition, initialData: { name: "" } });
					return {};
				},
				template: "<div></div>",
			}),
		);
		expect(wizard.loading.isLoadingStep.value).toBe(false);
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.navigation.goNext();
		await flush();
		expect(wizard.loading.isLoadingStep.value).toBe(true);

		release();
		await nav;
		expect(wizard.loading.isLoadingStep.value).toBe(false);
		expect(wizard.state.currentStepId.value).toBe("b");
	});
});
