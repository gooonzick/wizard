import type { WizardPlugin } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

interface D extends Record<string, unknown> {
	name: string;
}
const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("Vue beforeTransition veto through the binding", () => {
	it("blocks navigation and leaves the visible state on step1", async () => {
		const beforeTransition = vi.fn(() => false);
		const plugins: WizardPlugin<D>[] = [{ name: "veto", beforeTransition }];
		let wizard!: UseWizardReturn<D>;
		const Comp = defineComponent({
			setup() {
				wizard = useWizard<D>({
					definition: def,
					initialData: { name: "" },
					plugins,
				});
				return () => null;
			},
		});
		mount(Comp);
		await new Promise((r) => setTimeout(r, 10));

		await wizard.navigation.goNext();
		await new Promise((r) => setTimeout(r, 10));

		expect(beforeTransition).toHaveBeenCalled();
		expect(wizard.state.currentStepId.value).toBe("step1");
		expect(wizard.navigation.canGoBack.value).toBe(false);
	});
});

describe("Vue restore through the binding", () => {
	it("restore() re-syncs the visible step", async () => {
		let src!: UseWizardReturn<D>;
		mount(
			defineComponent({
				setup() {
					src = useWizard<D>({ definition: def, initialData: { name: "a" } });
					return () => null;
				},
			}),
		);
		await new Promise((r) => setTimeout(r, 10));
		await src.navigation.goNext();
		const serialized = src.actions.serialize();
		expect(serialized.currentStepId).toBe("step2");

		let tgt!: UseWizardReturn<D>;
		mount(
			defineComponent({
				setup() {
					tgt = useWizard<D>({ definition: def, initialData: { name: "" } });
					return () => null;
				},
			}),
		);
		await new Promise((r) => setTimeout(r, 10));
		expect(tgt.state.currentStepId.value).toBe("step1");

		tgt.actions.restore(serialized);
		await new Promise((r) => setTimeout(r, 10));
		expect(tgt.state.currentStepId.value).toBe("step2");
		expect(tgt.state.data.value).toEqual(serialized.data);
	});
});
