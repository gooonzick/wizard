import { mount } from "@vue/test-utils";
import { createLinearWizard } from "@wizard/core";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
} from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

describe("Granular Composables", () => {
	const createTestDefinition = () =>
		createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

	it("useWizardData should return state slice", () => {
		const definition = createTestDefinition();
		const ChildComponent = defineComponent({
			setup() {
				const state = useWizardData<{ name: string }>();
				return { state };
			},
			template: "<div>{{ state.currentStepId.value }}</div>",
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

	it("useWizardNavigation should return navigation slice", () => {
		const definition = createTestDefinition();
		const ChildComponent = defineComponent({
			setup() {
				const nav = useWizardNavigation();
				return { nav };
			},
			template: "<div>{{ nav.isFirstStep.value }}</div>",
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
		expect(wrapper.text()).toBe("true");
	});

	it("useWizardValidation should return validation slice", () => {
		const definition = createTestDefinition();
		const ChildComponent = defineComponent({
			setup() {
				const validation = useWizardValidation();
				return { validation };
			},
			template: "<div>{{ validation.isValid.value }}</div>",
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
		expect(wrapper.text()).toBe("true");
	});

	it("useWizardLoading should return loading slice", () => {
		const definition = createTestDefinition();
		const ChildComponent = defineComponent({
			setup() {
				const loading = useWizardLoading();
				return { loading };
			},
			template: "<div>{{ loading.isValidating.value }}</div>",
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
		expect(wrapper.text()).toBe("false");
	});

	it("useWizardActions should return actions slice", () => {
		const definition = createTestDefinition();
		const ChildComponent = defineComponent({
			setup() {
				const actions = useWizardActions<{ name: string }>();
				return { actions };
			},
			template: `
				<div>
					<button @click="actions.updateField('name', 'test')">Update</button>
				</div>
			`,
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
		expect(wrapper.find("button").exists()).toBe(true);
	});
});
