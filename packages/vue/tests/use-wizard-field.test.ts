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

	it("binds multiple independent fields against the same wizard", async () => {
		const definition = createLinearWizard<{ first: string; last: string }>({
			id: "multi-field",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { first: "", last: "" },
				});
				const first = useWizardField(wizard, "first");
				const last = useWizardField(wizard, "last");
				return { first, last, wizard };
			},
			template:
				'<div><input class="first" :value="first" @input="e => first = e.target.value" /><input class="last" :value="last" @input="e => last = e.target.value" /></div>',
		});

		const wrapper = mount(TestComponent);
		const vm = wrapper.vm as {
			wizard: ReturnType<typeof useWizard<{ first: string; last: string }>>;
		};

		await wrapper.find(".first").setValue("Alice");
		await nextTick();
		expect(vm.wizard.state.data.value.first).toBe("Alice");
		expect(vm.wizard.state.data.value.last).toBe("");

		await wrapper.find(".last").setValue("Smith");
		await nextTick();
		expect(vm.wizard.state.data.value.last).toBe("Smith");
		expect(vm.wizard.state.data.value.first).toBe("Alice");
	});

	it("reflects external data updates back to the field ref", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "reflect-field",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		let nameRef!: ReturnType<typeof useWizardField<{ name: string }, "name">>;
		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				nameRef = useWizardField(wizard, "name");
				return { name: nameRef, wizard };
			},
			template: "<div>{{ name }}</div>",
		});

		const wrapper = mount(TestComponent);
		const vm = wrapper.vm as {
			wizard: ReturnType<typeof useWizard<{ name: string }>>;
		};

		// Update via actions (not via field ref)
		vm.wizard.actions.updateField("name", "External");
		await nextTick();

		// Verify the computed ref picks up the change
		expect(nameRef.value).toBe("External");
	});
});
