import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import type { CreateWizardStoreOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeStore(
	overrides: Partial<CreateWizardStoreOptions<SignupData>> = {},
) {
	return createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...overrides,
	});
}

describe("field stores", () => {
	it("F1: emits the current value synchronously", () => {
		const wizard = makeStore();
		const name = wizard.field("name");

		let value: string | undefined;
		let returned = false;
		let sync = false;
		const unsubscribe = name.subscribe((v) => {
			if (!returned) sync = true;
			value = v;
		});
		returned = true;

		expect(sync).toBe(true);
		expect(value).toBe("");
		unsubscribe();
	});

	it("F2: set routes through machine.updateField", () => {
		const onDataChange = vi.fn();
		const wizard = makeStore({ onDataChange });

		wizard.field("name").set("bob");

		expect(get(wizard).data.name).toBe("bob");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});

	it("F3: setting an identical value produces no re-emit", () => {
		const wizard = makeStore();
		const name = wizard.field("name");
		const seen = vi.fn();
		const unsubscribe = name.subscribe(seen);
		expect(seen).toHaveBeenCalledTimes(1);

		name.set("");

		expect(seen).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("F4: update() applies an updater to the current value", () => {
		const wizard = makeStore();
		const name = wizard.field("name");
		name.set("ada");

		name.update((v) => `${v}!`);

		expect(get(wizard).data.name).toBe("ada!");
	});

	it("F5: field() returns a stable reference per key", () => {
		const wizard = makeStore();

		expect(wizard.field("name")).toBe(wizard.field("name"));
		expect(wizard.field("name")).not.toBe(wizard.field("email"));
	});

	it("F6: reflects updateData, reset and restore", async () => {
		const wizard = makeStore();
		await flush();
		const name = wizard.field("name");
		const seen: string[] = [];
		const unsubscribe = name.subscribe((v) => seen.push(v));

		wizard.actions.updateData((d) => ({ ...d, name: "ada" }));
		expect(seen.at(-1)).toBe("ada");

		const serialized = wizard.actions.serialize();

		wizard.actions.reset();
		await flush();
		expect(seen.at(-1)).toBe("");

		wizard.actions.restore(serialized);
		await flush();
		await flush();
		expect(seen.at(-1)).toBe("ada");

		unsubscribe();
	});

	it("F7: changing another field does not re-emit", () => {
		const wizard = makeStore();
		const name = wizard.field("name");
		const seen = vi.fn();
		const unsubscribe = name.subscribe(seen);
		expect(seen).toHaveBeenCalledTimes(1);

		wizard.actions.updateField("email", "a@b.c");

		expect(seen).toHaveBeenCalledTimes(1);
		unsubscribe();
	});
});
