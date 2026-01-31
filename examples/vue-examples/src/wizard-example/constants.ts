export const stepIds = [
	"personal",
	"preferences",
	"account",
	"business",
	"plan",
	"contact",
	"review",
] as const;

export const stepTitles: Record<string, string> = {
	personal: "Personal",
	preferences: "Preferences",
	account: "Account",
	business: "Business",
	plan: "Plan",
	contact: "Contact",
	review: "Review",
};

export const fieldLabels: Record<string, string> = {
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	phone: "Phone",
	newsletter: "Newsletter",
	notifications: "Notifications",
	theme: "Theme",
	username: "Username",
	password: "Password",
	confirmPassword: "Confirm Password",
	companyName: "Company Name",
	companySize: "Company Size",
	plan: "Plan",
	message: "Message",
};
