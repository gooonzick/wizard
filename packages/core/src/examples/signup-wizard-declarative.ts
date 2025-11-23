import type { StandardSchemaV1 } from "@standard-schema/spec";
import { createStandardSchemaValidator, type WizardDefinition } from "../index";

/**
 * Example: Signup wizard with conditional branching
 */

export type SignupWizardData = {
	// Personal info
	name: string;
	email: string;
	age: number;

	// Plan selection
	plan: "basic" | "pro" | "enterprise";
	billingCycle: "monthly" | "yearly";

	// Optional invoice
	needsInvoice: boolean;
	companyName?: string;
	taxId?: string;

	// Payment
	paymentMethod: "card" | "paypal" | "wire";
	cardNumber?: string;

	// Agreement
	termsAccepted: boolean;
	newsletterSubscribe: boolean;
};

const personalInfoSchema: StandardSchemaV1<SignupWizardData> = {
	"~standard": {
		version: 1,
		vendor: "wizard-example",
		validate: (value) => {
			const data = value as SignupWizardData;
			const issues: StandardSchemaV1.Issue[] = [];

			if (!data.name || data.name.length < 2) {
				issues.push({
					message: "Name must be at least 2 characters",
					path: ["name"],
				});
			}

			if (!data.email || !data.email.includes("@")) {
				issues.push({
					message: "Valid email is required",
					path: ["email"],
				});
			}

			if (!data.age || data.age < 18) {
				issues.push({
					message: "Must be at least 18 years old",
					path: ["age"],
				});
			}

			if (issues.length > 0) {
				return { issues };
			}

			return { value: data };
		},
	},
};

const planSelectionSchema: StandardSchemaV1<SignupWizardData> = {
	"~standard": {
		version: 1,
		vendor: "wizard-example",
		validate: (value) => {
			const data = value as SignupWizardData;
			const issues: StandardSchemaV1.Issue[] = [];

			if (!data.plan) {
				issues.push({ message: "Please select a plan", path: ["plan"] });
			}

			if (!data.billingCycle) {
				issues.push({
					message: "Billing cycle is required",
					path: ["billingCycle"],
				});
			}

			if (issues.length > 0) {
				return { issues };
			}

			return { value: data };
		},
	},
};

/**
 * Declarative wizard definition
 */
export const signupWizard: WizardDefinition<SignupWizardData> = {
	id: "signup-wizard",
	initialStepId: "personal",

	steps: {
		// Step 1: Personal information
		personal: {
			id: "personal",
			next: { type: "static", to: "plan" },

			validate: createStandardSchemaValidator(personalInfoSchema),

			meta: {
				title: "Personal Information",
				description: "Tell us about yourself",
				icon: "👤",
			},
		},

		// Step 2: Plan selection
		plan: {
			id: "plan",
			previous: { type: "static", to: "personal" },
			next: {
				type: "conditional",
				branches: [
					{
						when: (data) => data.needsInvoice,
						to: "invoice",
					},
					{
						when: (data) => data.plan === "enterprise",
						to: "enterprise-contact",
					},
					{
						when: () => true,
						to: "payment",
					},
				],
			},

			validate: createStandardSchemaValidator(planSelectionSchema),

			onEnter: async (data, _ctx) => {
				void _ctx;
				console.log("User is viewing plans", {
					fromStep: "personal",
					userName: data.name,
				});
			},

			meta: {
				title: "Choose Your Plan",
				description: "Select the plan that best fits your needs",
				icon: "📋",
			},
		},

		// Step 3a: Invoice details (conditional)
		invoice: {
			id: "invoice",
			previous: { type: "static", to: "plan" },
			next: { type: "static", to: "payment" },

			// This step is only enabled if user needs invoice
			enabled: (data) => data.needsInvoice,

			validate: (data) => {
				if (!data.needsInvoice) return { valid: true };

				const errors: Record<string, string> = {};

				if (!data.companyName) {
					errors.companyName = "Company name is required for invoice";
				}

				if (!data.taxId) {
					errors.taxId = "Tax ID is required for invoice";
				}

				return {
					valid: Object.keys(errors).length === 0,
					errors: Object.keys(errors).length > 0 ? errors : undefined,
				};
			},

			meta: {
				title: "Invoice Details",
				description: "Provide your company information",
				icon: "🧾",
			},
		},

		// Step 3b: Enterprise contact (conditional)
		"enterprise-contact": {
			id: "enterprise-contact",
			previous: { type: "static", to: "plan" },
			next: { type: "static", to: "summary" },

			enabled: (data) => data.plan === "enterprise",

			onSubmit: async (data, _ctx) => {
				void _ctx;
				// Send enterprise inquiry
				console.log("Sending enterprise inquiry for:", data.email);
			},

			meta: {
				title: "Enterprise Contact",
				description: "Our team will contact you within 24 hours",
				icon: "🏢",
			},
		},

		// Step 4: Payment
		payment: {
			id: "payment",
			previous: {
				type: "resolver",
				resolve: (data) => {
					if (data.needsInvoice) return "invoice";
					return "plan";
				},
			},
			next: { type: "static", to: "summary" },

			// Skip for enterprise plans
			enabled: (data) => data.plan !== "enterprise",

			validate: (data) => {
				const errors: Record<string, string> = {};

				if (!data.paymentMethod) {
					errors.paymentMethod = "Please select payment method";
				}

				if (data.paymentMethod === "card" && !data.cardNumber) {
					errors.cardNumber = "Card number is required";
				}

				return {
					valid: Object.keys(errors).length === 0,
					errors: Object.keys(errors).length > 0 ? errors : undefined,
				};
			},

			meta: {
				title: "Payment Information",
				description: "Secure payment processing",
				icon: "💳",
			},
		},

		// Step 5: Summary and confirmation
		summary: {
			id: "summary",
			previous: {
				type: "resolver",
				resolve: (data) => {
					if (data.plan === "enterprise") return "enterprise-contact";
					return "payment";
				},
			},

			validate: (data) => ({
				valid: data.termsAccepted,
				errors: !data.termsAccepted
					? { terms: "You must accept the terms and conditions" }
					: undefined,
			}),

			onSubmit: async (data, _ctx) => {
				void _ctx;
				console.log("Processing signup...", {
					user: data.email,
					plan: data.plan,
					invoice: data.needsInvoice,
				});

				// Simulate API call
				await new Promise((resolve) => setTimeout(resolve, 1000));

				console.log("Signup completed successfully!");
			},

			meta: {
				title: "Review & Confirm",
				description: "Review your information and complete signup",
				icon: "✅",
			},
		},
	},

	// Global completion handler
	onComplete: async (data, _ctx) => {
		void _ctx;
		console.log("🎉 Wizard completed!", {
			user: data.name,
			email: data.email,
			plan: data.plan,
			newsletter: data.newsletterSubscribe,
		});

		// Could redirect to dashboard, show success message, etc.
	},
};
