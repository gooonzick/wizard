import type {
	StepGuard,
	SubmitHandler,
	WizardDefinition,
} from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-core";

/**
 * Shared registration-wizard fixture (same shape across all framework
 * bindings). Plain object data: `WizardData` = `Record<string, unknown>`.
 */
export interface RegistrationData extends Record<string, unknown> {
	name: string;
	email: string;
	accountType: "personal" | "business" | "";
	company: string;
	agree: boolean;
}

export const STEP_IDS = ["personal", "account", "company", "review"] as const;

export const emptyRegistration = (): RegistrationData => ({
	name: "",
	email: "",
	accountType: "",
	company: "",
	agree: false,
});

export interface RegistrationDefinitionOptions {
	/** Injectable async submit handler for the `company` step. */
	companyOnSubmit?: SubmitHandler<RegistrationData>;
	/** Injectable `definition.onComplete`. */
	onComplete?: (data: RegistrationData) => void | Promise<void>;
	/** Injectable `definition.onCancel`. */
	onCancel?: (data: RegistrationData) => void | Promise<void>;
	/** Override of the `company` step's `enabled` guard (e.g. a throwing one). */
	companyEnabled?: StepGuard<RegistrationData>;
}

export function createRegistrationDefinition(
	options: RegistrationDefinitionOptions = {},
): WizardDefinition<RegistrationData> {
	const builder = createWizard<RegistrationData>("registration")
		.step("personal", (s) =>
			s
				.title("Personal details")
				// Async validator: errors keyed by field.
				.validate(async (d) => {
					const errors: Record<string, string> = {};
					if (!d.name.trim()) {
						errors.name = "Name is required";
					}
					if (!d.email.trim()) {
						errors.email = "Email is required";
					} else if (!d.email.includes("@")) {
						errors.email = "Email must contain @";
					}
					return Object.keys(errors).length === 0
						? { valid: true }
						: { valid: false, errors };
				})
				.next("account"),
		)
		.step("account", (s) =>
			s
				.title("Account type")
				.previous("personal")
				.validate((d) =>
					d.accountType
						? { valid: true }
						: {
								valid: false,
								errors: { accountType: "Choose an account type" },
							},
				)
				// business -> company, personal -> review. The second branch also
				// catches the unset value so the step is never reported as terminal
				// (the validator blocks leaving it with an empty accountType anyway).
				.nextWhen([
					{ when: (d) => d.accountType === "business", to: "company" },
					{ when: (d) => d.accountType !== "business", to: "review" },
				]),
		)
		.step("company", (s) => {
			s.title("Company")
				.previous("account")
				.enabled(
					options.companyEnabled ?? ((d) => d.accountType === "business"),
				)
				.validate((d) =>
					d.company.trim()
						? { valid: true }
						: { valid: false, errors: { company: "Company is required" } },
				)
				.next("review");
			if (options.companyOnSubmit) {
				s.onSubmit(options.companyOnSubmit);
			}
		})
		.step("review", (s) =>
			s
				.title("Review")
				// Deliberately WRONG for the personal path: history-based Back must
				// win over the static `previous` transition.
				.previous("company")
				.validate((d) =>
					d.agree
						? { valid: true }
						: { valid: false, errors: { agree: "You must accept the terms" } },
				),
		);

	if (options.onComplete) {
		const onComplete = options.onComplete;
		builder.onComplete((data) => onComplete(data));
	}
	if (options.onCancel) {
		const onCancel = options.onCancel;
		builder.onCancel((data) => onCancel(data));
	}
	return builder.build();
}
