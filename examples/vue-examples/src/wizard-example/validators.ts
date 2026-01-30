import type { ValidationResult } from "@gooonzick/wizard-core";
import type { RegistrationData } from "../types/wizard-data";

export const emailValidator = (data: RegistrationData): ValidationResult => {
	if (!data.email) return { valid: true };
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(data.email)) {
		return {
			valid: false,
			errors: { email: "Please enter a valid email address" },
		};
	}
	return { valid: true };
};

export const passwordMatchValidator = (
	data: RegistrationData,
): ValidationResult => {
	if (
		data.password &&
		data.confirmPassword &&
		data.password !== data.confirmPassword
	) {
		return {
			valid: false,
			errors: {
				confirmPassword: "Passwords do not match",
			},
		};
	}
	return { valid: true };
};
