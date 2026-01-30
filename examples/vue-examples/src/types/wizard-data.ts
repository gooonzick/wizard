export interface RegistrationData extends Record<string, unknown> {
	// Basic Info
	firstName: string;
	lastName: string;
	email: string;
	phone?: string;

	// Preferences
	newsletter: boolean;
	notifications: "email" | "sms" | "none";
	theme: "light" | "dark" | "system";

	// Account
	username: string;
	password: string;
	confirmPassword: string;

	// Business (conditional)
	companyName?: string;
	companySize?: "1-10" | "11-50" | "51-200" | "200+";

	// Subscription (conditional)
	plan?: "free" | "starter" | "pro" | "enterprise";

	// Contact (for enterprise)
	message?: string;
}
