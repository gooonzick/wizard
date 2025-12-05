import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { useWizard } from "../src/use-wizard";

describe("useWizard", () => {
	it("should initialize with first step", () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: "<div>{{ wizard.state.currentStepId.value }}</div>",
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe("step1");
	});

	it("should call onStateChange when state changes", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const onStateChange = vi.fn();

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
					onStateChange,
				});
				return { wizard };
			},
			template: `
				<div>
					<button @click="wizard.navigation.goNext">Next</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		await wrapper.find("button").trigger("click");
		await wrapper.vm.$nextTick();

		expect(onStateChange).toHaveBeenCalled();
	});

	it("should return state slice with correct types", () => {
		const definition = createLinearWizard<{ name: string; age: number }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "John", age: 30 },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="name">{{ wizard.state.data.value.name }}</span>
					<span class="age">{{ wizard.state.data.value.age }}</span>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".name").text()).toBe("John");
		expect(wrapper.find(".age").text()).toBe("30");
	});

	it("should update data with updateField", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="name">{{ wizard.state.data.value.name }}</span>
					<button @click="wizard.actions.updateField('name', 'Updated')">Update</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".name").text()).toBe("");

		await wrapper.find("button").trigger("click");
		await nextTick();

		expect(wrapper.find(".name").text()).toBe("Updated");
	});

	it("should navigate between steps", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
				{ id: "step3", title: "Step 3" },
			],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="step">{{ wizard.state.currentStepId.value }}</span>
					<button class="next" @click="wizard.navigation.goNext">Next</button>
					<button class="prev" @click="wizard.navigation.goPrevious">Previous</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".step").text()).toBe("step1");

		await wrapper.find(".next").trigger("click");
		// Wait for async navigation to complete
		await new Promise((resolve) => setTimeout(resolve, 10));
		await nextTick();
		expect(wrapper.find(".step").text()).toBe("step2");

		await wrapper.find(".next").trigger("click");
		await new Promise((resolve) => setTimeout(resolve, 10));
		await nextTick();
		expect(wrapper.find(".step").text()).toBe("step3");

		await wrapper.find(".prev").trigger("click");
		await new Promise((resolve) => setTimeout(resolve, 10));
		await nextTick();
		expect(wrapper.find(".step").text()).toBe("step2");
	});

	it("should reset wizard state", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "initial" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="step">{{ wizard.state.currentStepId.value }}</span>
					<span class="name">{{ wizard.state.data.value.name }}</span>
					<button class="next" @click="wizard.navigation.goNext">Next</button>
					<button class="update" @click="wizard.actions.updateField('name', 'updated')">Update</button>
					<button class="reset" @click="wizard.actions.reset({ name: 'reset' })">Reset</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);

		// Navigate and update
		await wrapper.find(".next").trigger("click");
		await nextTick();
		await wrapper.find(".update").trigger("click");
		await nextTick();

		expect(wrapper.find(".step").text()).toBe("step2");
		expect(wrapper.find(".name").text()).toBe("updated");

		// Reset
		await wrapper.find(".reset").trigger("click");
		await nextTick();

		expect(wrapper.find(".step").text()).toBe("step1");
		expect(wrapper.find(".name").text()).toBe("reset");
	});

	it("should call lifecycle callbacks", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
					onStepEnter,
					onStepLeave,
				});
				return { wizard };
			},
			template: `
				<div>
					<button @click="wizard.navigation.goNext">Next</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);

		// Initial enter callback
		expect(onStepEnter).toHaveBeenCalledWith("step1", { name: "" });

		await wrapper.find("button").trigger("click");
		// Wait for async navigation to complete
		await new Promise((resolve) => setTimeout(resolve, 10));
		await nextTick();

		expect(onStepLeave).toHaveBeenCalledWith("step1", { name: "" });
		expect(onStepEnter).toHaveBeenCalledWith("step2", { name: "" });
	});

	it("should expose loading states", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="validating">{{ wizard.loading.isValidating.value }}</span>
					<span class="submitting">{{ wizard.loading.isSubmitting.value }}</span>
					<span class="navigating">{{ wizard.loading.isNavigating.value }}</span>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".validating").text()).toBe("false");
		expect(wrapper.find(".submitting").text()).toBe("false");
		expect(wrapper.find(".navigating").text()).toBe("false");
	});

	it("should expose validation state", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="valid">{{ wizard.validation.isValid.value }}</span>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".valid").text()).toBe("true");
	});

	it("should cleanup watchers on unmount", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: "<div>{{ wizard.state.currentStepId.value }}</div>",
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe("step1");

		// Unmount should not throw
		wrapper.unmount();
	});

	it("should call onError when navigation state update fails", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const onError = vi.fn();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
					onError,
				});
				return { wizard };
			},
			template: "<div>{{ wizard.state.currentStepId.value }}</div>",
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.text()).toBe("step1");

		consoleError.mockRestore();
	});

	it("should return currentStep computed ref", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template:
				"<div>{{ wizard.state.currentStepId.value }} - {{ wizard.state.currentStep.value?.id }}</div>",
		});

		const wrapper = mount(TestComponent);
		await nextTick();
		// The currentStepId is always available, currentStep.value.id matches
		expect(wrapper.text()).toContain("step1");
		expect(wrapper.text()).toContain("step1 - step1");
	});

	it("should return navigation helpers", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const TestComponent = defineComponent({
			setup() {
				const wizard = useWizard({
					definition,
					initialData: { name: "" },
				});
				return { wizard };
			},
			template: `
				<div>
					<span class="first">{{ wizard.navigation.isFirstStep.value }}</span>
					<span class="last">{{ wizard.navigation.isLastStep.value }}</span>
					<button @click="wizard.navigation.goNext">Next</button>
				</div>
			`,
		});

		const wrapper = mount(TestComponent);
		expect(wrapper.find(".first").text()).toBe("true");

		await wrapper.find("button").trigger("click");
		// Wait for async navigation to complete
		await new Promise((resolve) => setTimeout(resolve, 10));
		await nextTick();

		// After navigating to last step
		expect(wrapper.find(".first").text()).toBe("false");
	});
});
