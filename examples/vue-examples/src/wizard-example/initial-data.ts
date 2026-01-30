import type { RegistrationData } from "../types/wizard-data";

export const initialData: RegistrationData = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	newsletter: false,
	notifications: "email",
	theme: "light",
	username: "",
	password: "",
	confirmPassword: "",
	companyName: "",
	companySize: undefined,
	plan: undefined,
	message: "",
};
