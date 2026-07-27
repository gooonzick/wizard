import type { Writable } from "svelte/store";
import { describe, expect, it } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

/**
 * Compile-time assertions. `vitest` strips types, so a green run proves nothing
 * here — `pnpm typecheck` (tsc --build) is the gate that actually validates this
 * file. The runtime body only exists so vitest reports the file.
 */
describe("types", () => {
	it("Y1-Y4: the public surface type-checks as documented", () => {
		const wizard = createWizardStore<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});

		// Y1: field() is a Writable of the field's own type.
		const name: Writable<string> = wizard.field("name");
		expect(name).toBeDefined();

		// Y2: unknown keys are rejected.
		// @ts-expect-error - "nope" is not a key of SignupData
		wizard.field("nope");

		// Y3: the value type must match the field type.
		// @ts-expect-error - name is a string, not a number
		wizard.actions.updateField("name", 123);

		// Y4: the aggregate is Readable — there is no `set`.
		// @ts-expect-error - WizardStore has no `set`
		wizard.set;
	});
});
