import { describe, expect, expectTypeOf, it } from "vitest";
import { createWizard, type WizardField } from "../src/index";
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
	it("Y1-Y5: the public surface type-checks as documented", () => {
		// Y1: T is inferred from `definition` without an explicit type argument.
		const wizard = createWizard({
			definition: createTestDefinition(),
			initialData,
			autoDestroy: false,
		});
		expectTypeOf(wizard.data).toEqualTypeOf<SignupData>();

		// Y2: field() is typed by the field's own type.
		const name: WizardField<string> = wizard.field("name");
		expect(name).toBeDefined();

		// Y3: unknown keys are rejected.
		// @ts-expect-error - "nope" is not a key of SignupData
		wizard.field("nope");

		// Y4: the value type must match the field type.
		// @ts-expect-error - name is a string, not a number
		wizard.actions.updateField("name", 123);

		// Y5: flat getters are read-only. Never executed: assigning to a getter-only
		// property throws at runtime in strict mode.
		const neverCalled = () => {
			// @ts-expect-error - currentStepId is read-only
			wizard.currentStepId = "plan";
		};
		expect(typeof neverCalled).toBe("function");
	});
});
