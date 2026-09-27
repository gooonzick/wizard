import { createLinearWizard } from "@gooonzick/wizard-core";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, isProxy, reactive, ref } from "vue";
import { useWizard } from "../src/use-wizard";

interface ProfileData extends Record<string, unknown> {
	name: string;
	address: { city: string; tags: string[] };
}

const definition = createLinearWizard<ProfileData>({
	id: "reactive-actions",
	steps: [
		{ id: "one", title: "One" },
		{ id: "two", title: "Two" },
	],
});

const plainData = (): ProfileData => ({
	name: "",
	address: { city: "", tags: [] },
});

let scope: ReturnType<typeof effectScope> | undefined;

function setup(
	options: { initialData?: ProfileData; onError?: () => void } = {},
) {
	scope = effectScope();
	const onDataChange = vi.fn();
	const wizard = scope.run(() =>
		useWizard<ProfileData>({
			definition,
			initialData: options.initialData ?? plainData(),
			onError: options.onError,
			onDataChange,
		}),
	);
	if (!wizard) throw new Error("scope did not run");
	return { wizard, onDataChange };
}

afterEach(() => {
	scope?.stop();
	scope = undefined;
});

describe("useWizard actions with Vue reactive values", () => {
	it("updateField(key, reactiveObject) stores plain data that serialize() can clone", () => {
		const onError = vi.fn();
		const { wizard } = setup({ onError });
		const address = reactive({ city: "Paris", tags: ["x"] });

		wizard.actions.updateField("address", address);

		expect(isProxy(wizard.state.data.value.address)).toBe(false);
		const serialized = wizard.actions.serialize();
		expect(serialized.data.address).toEqual({ city: "Paris", tags: ["x"] });

		// A later reset back to a snapshot-derived baseline must not throw either.
		wizard.actions.reset(serialized.data);
		expect(onError).not.toHaveBeenCalled();
	});

	it("updateField keeps its Object.is no-op for primitives (and plain object references)", () => {
		const { wizard, onDataChange } = setup();

		wizard.actions.updateField("name", "Ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);

		wizard.actions.updateField("name", "Ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);

		const current = wizard.state.data.value.address;
		wizard.actions.updateField("address", current);
		expect(onDataChange).toHaveBeenCalledTimes(1);
	});

	it("restore(serialized) with reactive data restores plain data and serializes again", async () => {
		const onError = vi.fn();
		const { wizard } = setup({ onError });
		const snapshot = wizard.actions.serialize();
		const reactiveSnapshot = reactive({
			...snapshot,
			data: { name: "Restored", address: { city: "Rome", tags: ["r"] } },
		});

		wizard.actions.restore(reactiveSnapshot);
		await flushPromises();

		expect(onError).not.toHaveBeenCalled();
		expect(wizard.state.data.value.name).toBe("Restored");
		const again = wizard.actions.serialize();
		expect(again.data).toEqual({
			name: "Restored",
			address: { city: "Rome", tags: ["r"] },
		});
		expect(isProxy(again.data.address)).toBe(false);
	});

	it("restore(state) accepts a ref()-held snapshot's data", async () => {
		const onError = vi.fn();
		const { wizard } = setup({ onError });
		const saved = ref(wizard.actions.serialize());
		saved.value.data.name = "From ref";

		wizard.actions.restore(saved.value);
		await flushPromises();

		expect(onError).not.toHaveBeenCalled();
		expect(wizard.state.data.value.name).toBe("From ref");
		expect(() => wizard.actions.serialize()).not.toThrow();
	});

	it("updateData unwraps a reactive value returned by the updater", () => {
		const onError = vi.fn();
		const { wizard } = setup({ onError });
		const next = reactive<ProfileData>({
			name: "Updated",
			address: { city: "Oslo", tags: ["o"] },
		});

		wizard.actions.updateData(() => next);

		expect(wizard.state.data.value.name).toBe("Updated");
		expect(isProxy(wizard.state.data.value)).toBe(false);
		expect(wizard.actions.serialize().data.address.city).toBe("Oslo");
		wizard.actions.reset();
		expect(onError).not.toHaveBeenCalled();
	});

	it("accepts a ref()'s value as initialData and resets back to it", async () => {
		const onError = vi.fn();
		const form = ref<ProfileData>({
			name: "Initial",
			address: { city: "Kyiv", tags: [] },
		});
		const { wizard } = setup({ initialData: form.value, onError });

		wizard.actions.updateField("name", "Changed");
		wizard.actions.reset();
		await flushPromises();

		expect(onError).not.toHaveBeenCalled();
		expect(wizard.state.data.value.name).toBe("Initial");
		expect(wizard.actions.serialize().data.address.city).toBe("Kyiv");
	});
});
