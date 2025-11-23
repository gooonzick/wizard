import { createLinearWizard, createValidator, createWizard } from "../index";

/**
 * Example: Creating a wizard using the builder pattern
 */

export type OnboardingData = {
	// Company info
	companyName: string;
	industry: string;
	size: "small" | "medium" | "large";

	// Integration
	integrations: string[];
	apiKey?: string;
	webhookUrl?: string;

	// Team
	inviteTeamMembers: boolean;
	teamEmails: string[];

	// Preferences
	timezone: string;
	language: string;
	notifications: {
		email: boolean;
		slack: boolean;
		inApp: boolean;
	};
};

/**
 * Custom validators
 */
const validateEmail = createValidator<OnboardingData>(
	(data) => {
		if (!data.inviteTeamMembers) return true;
		return data.teamEmails.every((email) => email.includes("@"));
	},
	"All team emails must be valid",
	"teamEmails",
);

const validateWebhook = createValidator<OnboardingData>(
	(data) => {
		if (!data.webhookUrl) return true;
		try {
			new URL(data.webhookUrl);
			return true;
		} catch {
			return false;
		}
	},
	"Invalid webhook URL",
	"webhookUrl",
);

/**
 * Build wizard using fluent API
 */
export const onboardingWizard = createWizard<OnboardingData>("onboarding")
	.initialStep("company")

	// Step 1: Company Information
	.step("company", (step) => {
		step
			.title("Company Information")
			.description("Tell us about your company")
			.icon("🏢")
			.required("companyName", "industry", "size")
			.next("integrations")
			.onEnter(async (data, ctx) => {
				console.log("Starting onboarding process", {
					hasContext: Boolean(ctx),
					previewCompany: data.companyName || "unknown",
				});
			});
	})

	// Step 2: Integrations
	.step("integrations", (step) => {
		step
			.title("Connect Your Tools")
			.description("Set up integrations with your existing tools")
			.icon("🔗")
			.previous("company")
			.nextWhen([
				{
					when: (data) => data.integrations.includes("slack"),
					to: "slack-setup",
				},
				{
					when: (data) => data.integrations.includes("api"),
					to: "api-setup",
				},
				{
					when: () => true,
					to: "team",
				},
			])
			.validate(async (data, _ctx) => {
				void _ctx;
				if (data.integrations.length === 0) {
					return {
						valid: false,
						errors: { integrations: "Select at least one integration" },
					};
				}
				return { valid: true };
			});
	})

	// Step 3a: Slack Setup (conditional)
	.step("slack-setup", (step) => {
		step
			.title("Slack Integration")
			.description("Connect your Slack workspace")
			.icon("💬")
			.previous("integrations")
			.next("team")
			.enabled((data) => data.integrations.includes("slack"))
			.onSubmit(async (data, _ctx) => {
				void _ctx;
				console.log("Setting up Slack integration...", {
					integrations: data.integrations,
				});
				// Would call Slack OAuth here
			});
	})

	// Step 3b: API Setup (conditional)
	.step("api-setup", (step) => {
		step
			.title("API Configuration")
			.description("Set up API access and webhooks")
			.icon("🔐")
			.previous("integrations")
			.nextResolver((data) => {
				// Dynamic routing based on other integrations
				if (data.integrations.includes("slack")) {
					return "slack-setup";
				}
				return "team";
			})
			.enabled((data) => data.integrations.includes("api"))
			.validate(validateWebhook)
			.onSubmit(async (data, _ctx) => {
				void _ctx;
				if (data.apiKey) {
					console.log("Validating API key...");
					// Would validate API key here
				}
			});
	})

	// Step 4: Team Setup
	.step("team", (step) => {
		step
			.title("Invite Your Team")
			.description("Add team members to your workspace")
			.icon("👥")
			.previous({
				type: "resolver",
				resolve: (data) => {
					if (data.integrations.includes("slack")) return "slack-setup";
					if (data.integrations.includes("api")) return "api-setup";
					return "integrations";
				},
			})
			.next("preferences")
			.validate(validateEmail)
			.onSubmit(async (data, _ctx) => {
				void _ctx;
				if (data.inviteTeamMembers && data.teamEmails.length > 0) {
					console.log(
						`Sending invites to ${data.teamEmails.length} team members`,
					);
					// Would send invitation emails here
				}
			});
	})

	// Step 5: Preferences
	.step("preferences", (step) => {
		step
			.title("Set Your Preferences")
			.description("Customize your experience")
			.icon("⚙️")
			.previous("team")
			.required("timezone", "language")
			.onLeave(async (data, _ctx) => {
				void _ctx;
				console.log("Saving preferences...", {
					timezone: data.timezone,
					language: data.language,
					notifications: data.notifications,
				});
			});
	})

	// Global completion
	.onComplete(async (data, _ctx) => {
		void _ctx;
		console.log("✅ Onboarding completed!");
		console.log("Company:", data.companyName);
		console.log("Integrations:", data.integrations);
		console.log("Team size:", data.teamEmails.length);

		// Would typically:
		// - Create workspace
		// - Set up integrations
		// - Send welcome emails
		// - Redirect to dashboard
	})
	.build();

/**
 * Example: Linear wizard using helper
 */
export const feedbackWizard = createLinearWizard<{
	rating: number;
	category: string;
	feedback: string;
	email?: string;
}>({
	id: "feedback",
	steps: [
		{
			id: "rating",
			title: "Rate Your Experience",
			description: "How satisfied are you with our product?",
			validate: async (data) => ({
				valid: data.rating > 0 && data.rating <= 5,
				errors: !data.rating ? { rating: "Please select a rating" } : undefined,
			}),
		},
		{
			id: "category",
			title: "Feedback Category",
			description: "What area does your feedback relate to?",
			validate: async (data) => ({
				valid: Boolean(data.category),
				errors: !data.category
					? { category: "Please select a category" }
					: undefined,
			}),
		},
		{
			id: "details",
			title: "Provide Details",
			description: "Tell us more about your experience",
			validate: async (data) => ({
				valid: Boolean(data.feedback && data.feedback.length >= 10),
				errors:
					!data.feedback || data.feedback.length < 10
						? { feedback: "Please provide at least 10 characters of feedback" }
						: undefined,
			}),
		},
		{
			id: "contact",
			title: "Contact Information",
			description: "Optional: Leave your email for follow-up",
			onSubmit: async (data, _ctx) => {
				void _ctx;
				console.log("Submitting feedback:", {
					rating: data.rating,
					category: data.category,
					hasEmail: Boolean(data.email),
				});
			},
		},
	],
	onComplete: async (data, _ctx) => {
		void _ctx;
		console.log("Thank you for your feedback!", {
			rating: data.rating,
			category: data.category,
		});
	},
});
