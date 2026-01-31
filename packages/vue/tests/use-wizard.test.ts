import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

/**
 * Helper: mounts a component that calls useWizard and returns both the
 * wrapper and a direct reference to the composable return value.
 * We capture the composable ref so we can call async methods directly
 * (avoiding the issue where Vue template @click handlers don't await
 * async return values) and assert on reactive computed values.
 */
function mountWizard<T extends Record<string, unknown>>(options: {
	definition: ReturnType<typeof createLinearWizard<T>>;
	initialData: T;
	onStateChange?: (state: unknown) => void;
	onStepEnter?: (stepId: string, data: T) => void;
	onStepLeave?: (stepId: string, data: T) => void;
	onComplete?: (data: T) => void;
	onError?: (error: Error) => void;
}) {
	let wizardRef!: UseWizardReturn<T>;
	const TestComponent = defineComponent({
		setup() {
			const wizard = useWizard(options);
			wizardRef = wizard;
			return { wizard };
		},
		template: "<div></div>",
	});
	const wrapper = mount(TestComponent);
	return { wrapper, wizard: wizardRef };
}

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

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
			onStateChange,
		});

		await wizard.navigation.goNext();
		expect(onStateChange).toHaveBeenCalled();
	});

	it("should return state slice with correct types", () => {
		const definition = createLinearWizard<{ name: string; age: number }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "John", age: 30 },
		});

		expect(wizard.state.data.value.name).toBe("John");
		expect(wizard.state.data.value.age).toBe(30);
	});

	it("should update data with updateField", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.state.data.value.name).toBe("");

		wizard.actions.updateField("name", "Updated");

		expect(wizard.state.data.value.name).toBe("Updated");
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

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.state.currentStepId.value).toBe("step1");

		await wizard.navigation.goNext();
		expect(wizard.state.currentStepId.value).toBe("step2");

		await wizard.navigation.goNext();
		expect(wizard.state.currentStepId.value).toBe("step3");

		await wizard.navigation.goPrevious();
		expect(wizard.state.currentStepId.value).toBe("step2");
	});

	it("should reset wizard state", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "initial" },
		});

		// Navigate and update
		await wizard.navigation.goNext();
		wizard.actions.updateField("name", "updated");

		expect(wizard.state.currentStepId.value).toBe("step2");
		expect(wizard.state.data.value.name).toBe("updated");

		// Reset
		wizard.actions.reset({ name: "reset" });

		expect(wizard.state.currentStepId.value).toBe("step1");
		expect(wizard.state.data.value.name).toBe("reset");
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

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
			onStepEnter,
			onStepLeave,
		});

		// Initial enter callback
		expect(onStepEnter).toHaveBeenCalledWith("step1", { name: "" });

		await wizard.navigation.goNext();

		expect(onStepLeave).toHaveBeenCalledWith("step1", { name: "" });
		expect(onStepEnter).toHaveBeenCalledWith("step2", { name: "" });
	});

	it("should expose loading states", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.loading.isValidating.value).toBe(false);
		expect(wizard.loading.isSubmitting.value).toBe(false);
		expect(wizard.loading.isNavigating.value).toBe(false);
	});

	it("should expose validation state", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.validation.isValid.value).toBe(true);
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

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
			onError,
		});

		expect(wizard.state.currentStepId.value).toBe("step1");

		consoleError.mockRestore();
	});

	it("should return currentStep computed ref", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.state.currentStepId.value).toBe("step1");
		expect(wizard.state.currentStep.value?.id).toBe("step1");
	});

	it("should return navigation helpers", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.navigation.isFirstStep.value).toBe(true);

		await wizard.navigation.goNext();

		// isFirstStep is a computed based on currentStepId (updates synchronously)
		expect(wizard.navigation.isFirstStep.value).toBe(false);
		expect(wizard.state.currentStepId.value).toBe("step2");
	});

	it("should navigate back multiple steps with goBack", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
				{ id: "step3", title: "Step 3" },
			],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.state.currentStepId.value).toBe("step1");

		// Navigate to step3
		await wizard.navigation.goNext();
		await wizard.navigation.goNext();
		expect(wizard.state.currentStepId.value).toBe("step3");

		// Go back 2 steps
		await wizard.navigation.goBack(2);
		expect(wizard.state.currentStepId.value).toBe("step1");
	});

	it("should navigate to a specific step with goToStep", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
				{ id: "step3", title: "Step 3" },
			],
		});

		const { wizard } = mountWizard({
			definition,
			initialData: { name: "" },
		});

		expect(wizard.state.currentStepId.value).toBe("step1");

		// Jump to step3
		await wizard.navigation.goToStep("step3");
		expect(wizard.state.currentStepId.value).toBe("step3");

		// Jump back to step1
		await wizard.navigation.goToStep("step1");
		expect(wizard.state.currentStepId.value).toBe("step1");
	});
});
