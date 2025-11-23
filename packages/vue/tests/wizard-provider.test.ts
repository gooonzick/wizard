import { mount } from "@vue/test-utils";
import { createLinearWizard } from "@wizard/core";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import {
	useWizardProviderContext,
	WizardProvider,
} from "../src/wizard-provider";

describe("WizardProvider", () => {
	it("should provide wizard context to child components", () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const ChildComponent = defineComponent({
			setup() {
				const { wizard } = useWizardProviderContext<{ name: string }>();
				return { wizard };
			},
			template: "<div>{{ wizard.state.currentStepId.value }}</div>",
		});

		const ParentComponent = defineComponent({
			components: { ChildComponent, WizardProvider },
			template: `
				<WizardProvider :definition="definition" :initialData="initialData">
					<ChildComponent />
				</WizardProvider>
			`,
			data() {
				return {
					definition,
					initialData: { name: "" },
				};
			},
		});

		const wrapper = mount(ParentComponent);
		expect(wrapper.text()).toBe("step1");
	});

	it("should throw error when used outside provider", () => {
		const TestComponent = defineComponent({
			setup() {
				expect(() => {
					useWizardProviderContext();
				}).toThrow(
					"useWizardProviderContext must be used within WizardProvider",
				);
			},
			template: "<div></div>",
		});

		mount(TestComponent);
	});
});
