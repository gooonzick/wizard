import type { WizardPlugin } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useWizard } from "../src/use-wizard";
import { WizardProvider } from "../src/wizard-provider";

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

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Vue plugins option", () => {
	it("threads plugins into the machine (onInit fires)", async () => {
		const onInit = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", onInit }];
		const Comp = defineComponent({
			setup() {
				useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
				return () => null;
			},
		});
		mount(Comp);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (onScopeDispose)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const Comp = defineComponent({
			setup() {
				useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
				return () => null;
			},
		});
		const wrapper = mount(Comp);
		wrapper.unmount();
		await flush();
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (WizardProvider)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const Parent = defineComponent({
			components: { WizardProvider },
			data() {
				return { def, initialData: { name: "" }, plugins };
			},
			template: `<WizardProvider :definition="def" :initialData="initialData" :plugins="plugins"><div /></WizardProvider>`,
		});
		const wrapper = mount(Parent);
		wrapper.unmount();
		await flush();
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
