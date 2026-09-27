import type {
	StepGuard,
	ValidationResult,
	WizardDefinition,
} from "@gooonzick/wizard-core";
import { createWizard as defineWizard } from "@gooonzick/wizard-core";

/**
 * Registration wizard data (shared fixture across the framework bindings).
 *
 * A type alias, not an interface: only aliases get the implicit index
 * signature that `WizardData` (`Record<string, unknown>`) requires.
 */
export type RegistrationData = {
	name: string;
	email: string;
	accountType: "personal" | "business" | "";
	company: string;
	agree: boolean;
};

export const STEP_IDS = ["personal", "account", "company", "review"] as const;

export const STEP_TITLES: Record<(typeof STEP_IDS)[number], string> = {
	personal: "Personal",
	account: "Account",
	company: "Company",
	review: "Review",
};

export function createInitialData(): RegistrationData {
	return {
		name: "",
		email: "",
		accountType: "",
		company: "",
		agree: false,
	};
}

/** Injection points so each test controls the async work deterministically. */
export interface RegistrationHooks {
	/** Async `onSubmit` of the `company` step. */
	companySubmit?: (data: RegistrationData) => Promise<void>;
	/** `definition.onComplete`. */
	onComplete?: (data: RegistrationData) => Promise<void> | void;
	/** Overrides the `company` step's `enabled` guard. */
	companyEnabled?: StepGuard<RegistrationData>;
}

const ok = (): ValidationResult => ({ valid: true });

/**
 * 4-step registration wizard built with core's fluent builder:
 *
 *   personal -> account -(business)-> company -> review
 *                       \-(personal)-----------> review
 *
 * Deliberately NO `.previous()` anywhere: Back must work from the navigation
 * history alone (the resolver fallback would return null).
 *
 * The account step's second branch is `accountType !== "business"` rather than
 * `=== "personal"`: with an empty accountType both literal branches would be
 * false, the synchronous resolution would report the step as terminal and
 * `progress.isLastStep` would render "Finish" on the account step. Validation
 * still rejects an empty accountType before any transition.
 */
export function createRegistrationDefinition(
	hooks: RegistrationHooks = {},
): WizardDefinition<RegistrationData> {
	return defineWizard<RegistrationData>("registration")
		.step("personal", (step) =>
			step
				.title(STEP_TITLES.personal)
				.validate(async (data) => {
					const errors: Record<string, string> = {};
					if (data.name.trim() === "") {
						errors.name = "Name is required";
					}
					if (data.email.trim() === "") {
						errors.email = "Email is required";
					} else if (!data.email.includes("@")) {
						errors.email = "Email must contain @";
					}
					return Object.keys(errors).length > 0
						? { valid: false, errors }
						: ok();
				})
				.next("account"),
		)
		.step("account", (step) =>
			step
				.title(STEP_TITLES.account)
				.validate((data) =>
					data.accountType === ""
						? {
								valid: false,
								errors: { accountType: "Choose an account type" },
							}
						: ok(),
				)
				.nextWhen([
					{ when: (data) => data.accountType === "business", to: "company" },
					{ when: (data) => data.accountType !== "business", to: "review" },
				]),
		)
		.step("company", (step) => {
			step
				.title(STEP_TITLES.company)
				.enabled(
					hooks.companyEnabled ?? ((data) => data.accountType === "business"),
				)
				.validate((data) =>
					data.company.trim() === ""
						? { valid: false, errors: { company: "Company is required" } }
						: ok(),
				)
				.next("review");
			if (hooks.companySubmit) {
				const submit = hooks.companySubmit;
				step.onSubmit((data) => submit(data));
			}
		})
		.step("review", (step) =>
			step
				.title(STEP_TITLES.review)
				.validate((data) =>
					data.agree
						? ok()
						: { valid: false, errors: { agree: "You must accept the terms" } },
				),
		)
		.onComplete(async (data) => {
			await hooks.onComplete?.(data);
		})
		.build();
}
