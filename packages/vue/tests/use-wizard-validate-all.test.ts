import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

interface TestData extends Record<string, unknown> {
	name: string;
	email: string;
}

function mountWizard(initialData: TestData) {
	const definition = createLinearWizard<TestData>({
		id: "test",
		steps: [
			{
				id: "step1",
				title: "Step 1",
				validate: async (data) => ({
					valid: !!data.name,
					errors: data.name ? undefined : { name: "Name is required" },
				}),
			},
			{
				id: "step2",
				title: "Step 2",
				validate: async (data) => ({
					valid: !!data.email,
					errors: data.email ? undefined : { email: "Email is required" },
				}),
			},
		],
	});

	let wizardRef!: UseWizardReturn<TestData>;
	const TestComponent = defineComponent({
		setup() {
			const wizard = useWizard({ definition, initialData });
			wizardRef = wizard;
			return { wizard };
		},
		template: "<div></div>",
	});
	const wrapper = mount(TestComponent);
	return { wrapper, wizard: wizardRef };
}

describe("useWizard actions.validateAll", () => {
	it("exposes validateAll on the actions slice", () => {
		const { wizard } = mountWizard({ name: "", email: "" });
		expect(typeof wizard.actions.validateAll).toBe("function");
	});

	it("returns a summary of invalid steps", async () => {
		const { wizard } = mountWizard({ name: "", email: "" });

		const summary = await wizard.actions.validateAll();

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["step1", "step2"]);
		expect(summary.firstInvalidStepId).toBe("step1");
	});

	it("updateStatuses:true flips invalid step statuses reactively", async () => {
		const { wizard } = mountWizard({ name: "", email: "" });

		await wizard.actions.validateAll({ updateStatuses: true });
		await nextTick();

		expect(wizard.state.stepStatuses.value.step1).toBe("error");
		expect(wizard.state.stepStatuses.value.step2).toBe("error");
	});
});
