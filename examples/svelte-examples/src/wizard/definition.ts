import type { WizardDefinition } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { PLANS } from "./initial-data";
import type { SignupData } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A 3-step signup wizard (`personal -> plan -> summary`).
 *
 * Built fresh on every call: a definition is read once per wizard instance, and
 * the two demos on this page each own their own machine.
 */
export function createSignupWizard(): WizardDefinition<SignupData> {
	return createLinearWizard<SignupData>({
		id: "signup",
		steps: [
			{
				id: "personal",
				title: "Personal info",
				description: "Tell us who you are",
				validate: async (data) => {
					const errors: Record<string, string> = {};
					if (data.name.trim().length === 0) {
						errors.name = "Name is required";
					}
					if (!EMAIL_PATTERN.test(data.email)) {
						errors.email = "A valid email is required";
					}
					return Object.keys(errors).length > 0
						? { valid: false, errors }
						: { valid: true };
				},
			},
			{
				id: "plan",
				title: "Plan",
				description: "Pick a subscription",
				validate: async (data) =>
					PLANS.includes(data.plan as (typeof PLANS)[number])
						? { valid: true }
						: { valid: false, errors: { plan: "Pick one of the plans" } },
			},
			{
				id: "summary",
				title: "Summary",
				description: "Check everything and submit",
			},
		],
	});
}
