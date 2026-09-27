import type { WizardDefinition } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";

/**
 * Shared 3-step fixture data type.
 *
 * Declared as a type alias (not an interface) on purpose: TypeScript only grants
 * an implicit index signature to type aliases, so this satisfies `WizardData`
 * while keeping `keyof SignupData` narrow — which is what tests/types.test.ts
 * asserts on.
 */
export type SignupData = {
	name: string;
	email: string;
	plan: string;
};

export const initialData: SignupData = { name: "", email: "", plan: "" };

/**
 * A 3-step linear wizard (`personal -> plan -> summary`) whose first step is
 * invalid while `name` is empty.
 */
export function createTestDefinition(): WizardDefinition<SignupData> {
	return createLinearWizard<SignupData>({
		id: "signup",
		steps: [
			{
				id: "personal",
				title: "Personal",
				validate: async (data) =>
					data.name.trim().length > 0
						? { valid: true }
						: { valid: false, errors: { name: "Name is required" } },
			},
			{ id: "plan", title: "Plan" },
			{ id: "summary", title: "Summary" },
		],
	});
}

/**
 * The same 3-step fixture, except `personal` resolves its next step through an
 * async resolver that returns `null` (no next step).
 *
 * The state manager seeds navigation synchronously from core's conservative
 * `progress.isLastStep` (false for a resolver transition), so `canGoNext`
 * starts `true` / `isLastStep` `false`; the async navigation compute then
 * resolves the resolver to `null` and flips them to `canGoNext: false` /
 * `isLastStep: true`. Use it to exercise a navigation change that only the
 * async recompute produces.
 */
export function createAsyncTerminalDefinition(): WizardDefinition<SignupData> {
	const definition = createTestDefinition();
	return {
		...definition,
		steps: {
			...definition.steps,
			personal: {
				...definition.steps.personal,
				next: { type: "resolver", resolve: async () => null },
			},
		},
	};
}
