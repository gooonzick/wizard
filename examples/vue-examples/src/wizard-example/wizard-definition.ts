import { createWizard } from "@gooonzick/wizard-core";
import type { RegistrationData } from "../types/wizard-data";
import { businessComplete, enterpriseEligible } from "./guards";
import { emailValidator, passwordMatchValidator } from "./validators";

export const advancedWizard = createWizard<RegistrationData>("registration")
	.step("personal", (step) => {
		step
			.title("Personal Information")
			.description("Tell us about yourself")
			.required("firstName", "lastName", "email")
			.validate(emailValidator)
			.next("preferences");
	})
	.step("preferences", (step) => {
		step.title("Preferences").next("account").previous("personal");
	})
	.step("account", (step) => {
		step
			.title("Account Setup")
			.required("username", "password")
			.validate(passwordMatchValidator)
			.next("business")
			.previous("preferences");
	})
	.step("business", (step) => {
		step
			.title("Business Information")
			.enabled(businessComplete)
			.next("plan")
			.previous("account");
	})
	.step("plan", (step) => {
		step
			.title("Select Your Plan")
			.required("plan")
			.nextWhen([
				{
					when: enterpriseEligible,
					to: "contact",
				},
				{
					when: (data) => data.plan === "pro",
					to: "review",
				},
				{
					when: (data) => data.plan === "starter" || data.plan === "free",
					to: "review",
				},
			])
			.previous("business");
	})
	.step("contact", (step) => {
		step
			.title("Contact Sales")
			.description("Our team will reach out within 24 hours")
			.next("review")
			.previous("plan");
	})
	.step("review", (step) => {
		step
			.title("Review & Submit")
			.description("Please review your information before submitting")
			.nextResolver((data) => {
				if (data.plan === "enterprise") {
					return "contact";
				}
				if (data.plan === "pro" || data.companyName) {
					return "plan";
				}
				return "account";
			});
	})
	.build();
