import { createEffect, createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(options: Partial<CreateWizardOptions<SignupData>> = {}) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

describe("field()", () => {
	it("F1: returns a stable reference per key", () => {
		const wizard = makeWizard();

		expect(wizard.field("name")).toBe(wizard.field("name"));
		expect(wizard.field("name")).not.toBe(wizard.field("email"));
	});

	it("F2: writes route through updateField with changedFields = [key]", () => {
		const onDataChange = vi.fn();
		const wizard = makeWizard({ onDataChange });
		const name = wizard.field("name");

		name.value = "ada";

		expect(name.value).toBe("ada");
		expect(wizard.data.name).toBe("ada");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});

	it("F3: writing the same value is a no-op (Object.is guard)", () => {
		const onDataChange = vi.fn();
		const onStateChange = vi.fn();
		const wizard = makeWizard({ onDataChange, onStateChange });
		const name = wizard.field("name");
		name.value = "ada";
		onStateChange.mockClear();

		name.value = "ada";

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onStateChange).not.toHaveBeenCalled();
	});

	it("F4: reads are reactive", async () => {
		const wizard = makeWizard();
		await flush();
		const email = wizard.field("email");
		const seen: string[] = [];

		const dispose = createRoot((d) => {
			createEffect(() => {
				seen.push(email.value);
			});
			return d;
		});
		wizard.actions.updateField("email", "a@b.c");
		dispose();

		expect(seen).toEqual(["", "a@b.c"]);
	});
});
