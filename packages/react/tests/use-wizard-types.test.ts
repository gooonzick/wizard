import { describe, expectTypeOf, it } from "vitest";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardReturn,
	UseWizardState,
	UseWizardValidation,
} from "../src/use-wizard";

describe("useWizard return type structure", () => {
	it("should have nested state organization", () => {
		// This is a compile-time type check - verifies the structure compiles correctly
		type WizardData = { name: string };

		// Verify nested properties exist with correct types
		expectTypeOf<UseWizardReturn<WizardData>>().toHaveProperty("state");
		expectTypeOf<UseWizardReturn<WizardData>>().toHaveProperty("validation");
		expectTypeOf<UseWizardReturn<WizardData>>().toHaveProperty("navigation");
		expectTypeOf<UseWizardReturn<WizardData>>().toHaveProperty("loading");
		expectTypeOf<UseWizardReturn<WizardData>>().toHaveProperty("actions");

		// Verify nested types are assignable
		expectTypeOf<UseWizardReturn<WizardData>["state"]>().toExtend<
			UseWizardState<WizardData>
		>();
		expectTypeOf<
			UseWizardReturn<WizardData>["validation"]
		>().toExtend<UseWizardValidation>();
		expectTypeOf<
			UseWizardReturn<WizardData>["navigation"]
		>().toExtend<UseWizardNavigation>();
		expectTypeOf<
			UseWizardReturn<WizardData>["loading"]
		>().toExtend<UseWizardLoading>();
		expectTypeOf<UseWizardReturn<WizardData>["actions"]>().toExtend<
			UseWizardActions<WizardData>
		>();
	});

	it("should access data through nested slices", () => {
		type WizardData = { name: string };

		// Verify accessing properties through slices works
		expectTypeOf<UseWizardReturn<WizardData>["state"]>().toHaveProperty("data");
		expectTypeOf<UseWizardReturn<WizardData>["state"]>().toHaveProperty(
			"currentStepId",
		);
		expectTypeOf<UseWizardReturn<WizardData>["navigation"]>().toHaveProperty(
			"canGoNext",
		);
		expectTypeOf<UseWizardReturn<WizardData>["navigation"]>().toHaveProperty(
			"goNext",
		);
		expectTypeOf<UseWizardReturn<WizardData>["validation"]>().toHaveProperty(
			"isValid",
		);
		expectTypeOf<UseWizardReturn<WizardData>["loading"]>().toHaveProperty(
			"isValidating",
		);
		expectTypeOf<UseWizardReturn<WizardData>["actions"]>().toHaveProperty(
			"updateField",
		);
		expectTypeOf<UseWizardReturn<WizardData>["actions"]>().toHaveProperty(
			"validate",
		);
	});
});
