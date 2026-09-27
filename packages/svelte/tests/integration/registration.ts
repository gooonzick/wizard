import type { WizardDefinition } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-core";

/**
 * Shared registration fixture data.
 *
 * A type alias (not an interface) on purpose: only type aliases get an implicit
 * index signature, so this satisfies `WizardData` while keeping `keyof` narrow.
 */
export type RegistrationData = {
	name: string;
	email: string;
	accountType: "personal" | "business" | "";
	company: string;
	agree: boolean;
};

export const blankData: RegistrationData = {
	name: "",
	email: "",
	accountType: "",
	company: "",
	agree: false,
};

/** Step ids in definition (= indicator / progress) order. */
export const STEP_IDS = ["personal", "account", "company", "review"] as const;

export const MESSAGES = {
	name: "Name is required",
	email: "Enter a valid email address",
	accountType: "Choose an account type",
	company: "Company name is required",
	agree: "You must accept the terms",
} as const;

export interface RegistrationOptions {
	/** Injectable async `onSubmit` of the `company` step. */
	companySubmit?: (data: RegistrationData) => Promise<void>;
	/** Injected as `definition.onComplete`. */
	onComplete?: (data: RegistrationData) => void | Promise<void>;
	/** Overrides the `company` step's `enabled` guard. */
	companyEnabled?: (data: RegistrationData) => boolean;
}

/**
 * Registration wizard: personal -> account -> (company, business only) -> review.
 *
 * Every step carries a naive linear `.previous()` link on purpose: Back must
 * follow the navigation HISTORY, not these static links (e.g. Back from review
 * on the personal branch must land on `account`, not `company`).
 */
export function createRegistrationDefinition(
	options: RegistrationOptions = {},
): WizardDefinition<RegistrationData> {
	const {
		companySubmit,
		onComplete,
		companyEnabled = (data) => data.accountType === "business",
	} = options;

	const builder = createWizard<RegistrationData>("registration")
		.step("personal", (step) =>
			step
				.title("Personal details")
				.next("account")
				.validate(async (data) => {
					await Promise.resolve();
					const errors: Record<string, string> = {};
					if (data.name.trim() === "") {
						errors.name = MESSAGES.name;
					}
					if (!data.email.includes("@")) {
						errors.email = MESSAGES.email;
					}
					return Object.keys(errors).length === 0
						? { valid: true }
						: { valid: false, errors };
				}),
		)
		.step("account", (step) =>
			step
				.title("Account type")
				.previous("personal")
				// `.required()` accepts a trailing options object for custom messages.
				.required("accountType", {
					messages: { accountType: MESSAGES.accountType },
				})
				.nextWhen([
					{ when: (data) => data.accountType === "business", to: "company" },
					// Fallback so an unanswered account step is never "terminal".
					{ when: () => true, to: "review" },
				]),
		)
		.step("company", (step) => {
			step
				.title("Company")
				.previous("account")
				.next("review")
				.enabled(companyEnabled)
				.required("company", { messages: { company: MESSAGES.company } });
			if (companySubmit) {
				step.onSubmit(companySubmit);
			}
		})
		.step("review", (step) =>
			step
				.title("Review")
				.previous("company")
				.validate((data) =>
					data.agree
						? { valid: true }
						: { valid: false, errors: { agree: MESSAGES.agree } },
				),
		);

	if (onComplete) {
		builder.onComplete(onComplete);
	}

	return builder.build();
}
