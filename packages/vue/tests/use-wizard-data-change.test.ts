import { createLinearWizard } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

type Data = { name: string; email: string };

function mountWizard(onDataChange: (...args: unknown[]) => void) {
	let wizardRef!: UseWizardReturn<Data>;
	const definition = createLinearWizard<Data>({
		id: "data-change-wizard",
		steps: [{ id: "step1", title: "Step 1" }],
	});
	const TestComponent = defineComponent({
		setup() {
			const wizard = useWizard({
				definition,
				initialData: { name: "a", email: "a@x.io" },
				onDataChange,
			});
			wizardRef = wizard;
			return { wizard };
		},
		template: "<div></div>",
	});
	mount(TestComponent);
	return wizardRef;
}

describe("useWizard onDataChange option (WIZ-010)", () => {
	it("invokes onDataChange when updateField mutates a field", () => {
		const onDataChange = vi.fn();
		const wizard = mountWizard(onDataChange);

		wizard.actions.updateField("name", "b");

		expect(onDataChange).toHaveBeenCalledTimes(1);
		const [prev, next, changedFields] = onDataChange.mock.calls[0];
		expect(prev.name).toBe("a");
		expect(next.name).toBe("b");
		expect(changedFields).toEqual(["name"]);
	});

	it("invokes onDataChange when updateData mutates data", () => {
		const onDataChange = vi.fn();
		const wizard = mountWizard(onDataChange);

		wizard.actions.updateData((d) => ({ ...d, email: "b@x.io" }));

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["email"]);
	});
});
