import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";
import { useWizard } from "../src/use-wizard";
import { useWizardField } from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

describe("useWizardField", () => {
	it("binds a provider-backed field with a writable computed ref", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const ChildComponent = defineComponent({
			setup() {
				const name = useWizardField<{ name: string }, "name">("name");
				const onInput = (event: Event) => {
					name.value = (event.target as HTMLInputElement).value;
				};
				return { name, onInput };
			},
			template: '<input :value="name" @input="onInput" />',
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
		const input = wrapper.find("input");

		expect((input.element as HTMLInputElement).value).toBe("");

		await input.setValue("Alice");

		expect((input.element as HTMLInputElement).value).toBe("Alice");
	});

	it("binds a field against a direct useWizard return value", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "direct-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "Initial" },
				});
				const name = useWizardField(wizard, "name");
				const onInput = (event: Event) => {
					name.value = (event.target as HTMLInputElement).value;
				};
				return { name, onInput, wizard };
			},
			template: '<div><input :value="name" @input="onInput" /></div>',
		});

		const wrapper = mount(TestComponent);
		const input = wrapper.find("input");
		const vm = wrapper.vm as {
			wizard: ReturnType<typeof useWizard<{ name: string }>>;
		};

		expect(vm.wizard.state.data.value.name).toBe("Initial");

		await input.setValue("Updated");
		await nextTick();

		expect(vm.wizard.state.data.value.name).toBe("Updated");
	});
});
