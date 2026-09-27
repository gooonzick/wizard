import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive, ref } from "vue";
import { useWizard } from "../../src/use-wizard";
import {
	createRegistrationDefinition,
	emptyRegistration,
	type RegistrationData,
} from "./fixtures/registration-definition";

/**
 * Idiomatic Vue apps keep form state in `ref()` / `reactive()`, whose object
 * values are Proxies. The machine deep-clones incoming data with
 * `structuredClone`, which throws `DataCloneError` on a Proxy, so `useWizard()`
 * and its data-carrying actions strip Vue reactivity before it reaches the
 * machine.
 */
describe("Vue reactive state passed into the wizard", () => {
	const draftData: RegistrationData = {
		name: "Draft",
		email: "draft@example.com",
		accountType: "personal",
		company: "",
		agree: false,
	};

	it("useWizard accepts a reactive() object as initialData", async () => {
		const Form = defineComponent({
			setup() {
				const form = reactive<RegistrationData>({
					...emptyRegistration(),
					name: "From reactive",
				});
				const wizard = useWizard<RegistrationData>({
					definition: createRegistrationDefinition(),
					initialData: form,
				});
				return () =>
					h("p", { "data-testid": "name" }, wizard.state.data.value.name);
			},
		});

		const wrapper = mount(Form);
		await flushPromises();
		expect(wrapper.find('[data-testid="name"]').text()).toBe("From reactive");
		wrapper.unmount();
	});

	it("reset(draft.value) with a ref()-held object resets to that data", async () => {
		const onError = vi.fn();
		const Form = defineComponent({
			setup() {
				const draft = ref<RegistrationData>({ ...draftData });
				const wizard = useWizard<RegistrationData>({
					definition: createRegistrationDefinition(),
					initialData: emptyRegistration(),
					onError,
				});
				return () =>
					h("div", [
						h("p", { "data-testid": "name" }, wizard.state.data.value.name),
						h(
							"button",
							{
								"data-testid": "load",
								onClick: () => wizard.actions.reset(draft.value),
							},
							"Load draft",
						),
					]);
			},
		});

		const wrapper = mount(Form);
		await flushPromises();
		await wrapper.find('[data-testid="load"]').trigger("click");
		await flushPromises();

		expect(onError).not.toHaveBeenCalled();
		expect(wrapper.find('[data-testid="name"]').text()).toBe("Draft");
		wrapper.unmount();
	});

	it("setData(draft.value) with a ref()-held object applies that data", async () => {
		const Form = defineComponent({
			setup() {
				const draft = ref<RegistrationData>({ ...draftData });
				const wizard = useWizard<RegistrationData>({
					definition: createRegistrationDefinition(),
					initialData: emptyRegistration(),
				});
				const thrown = ref("");
				return () =>
					h("div", [
						h("p", { "data-testid": "name" }, wizard.state.data.value.name),
						h("p", { "data-testid": "thrown" }, thrown.value),
						h(
							"button",
							{
								"data-testid": "load",
								onClick: () => {
									try {
										wizard.actions.setData(draft.value);
									} catch (error) {
										thrown.value = (error as Error).name;
									}
								},
							},
							"Load draft",
						),
					]);
			},
		});

		const wrapper = mount(Form);
		await flushPromises();
		await wrapper.find('[data-testid="load"]').trigger("click");
		await flushPromises();

		expect(wrapper.find('[data-testid="thrown"]').text()).toBe("");
		expect(wrapper.find('[data-testid="name"]').text()).toBe("Draft");
		wrapper.unmount();
	});
});
