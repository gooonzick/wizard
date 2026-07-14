import { createWizard } from "@gooonzick/wizard-core";

/** Shared registration data used by several React demos. */
export type RegistrationData = {
	firstName: string;
	lastName: string;
	email: string;
	newsletter: boolean;
	theme: "light" | "dark";
};

export const registrationWizard = createWizard<RegistrationData>("registration")
	.initialStep("personal")
	.step("personal", (step) =>
		step
			.title("Personal Information")
			.required("firstName", "lastName", "email")
			.next("preferences"),
	)
	.step("preferences", (step) =>
		step.title("Preferences").next("review").previous("personal"),
	)
	.step("review", (step) =>
		step
			.title("Review")
			.description("Please review your information")
			.previous({
				type: "resolver",
				resolve: (data) => (data.newsletter ? "preferences" : "personal"),
			}),
	)
	.build();

export const registrationInitialData: RegistrationData = {
	firstName: "",
	lastName: "",
	email: "",
	newsletter: false,
	theme: "light",
};

export const registrationFieldLabels: Record<string, string> = {
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	newsletter: "Newsletter",
	theme: "Theme",
};

export const registrationStepIds = ["personal", "preferences", "review"];

export const registrationStepTitles: Record<string, string> = {
	personal: "Personal",
	preferences: "Preferences",
	review: "Review",
};
