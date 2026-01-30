import { andGuards } from "@gooonzick/wizard-core";
import type { RegistrationData } from "../types/wizard-data";

export const businessComplete = (data: RegistrationData): boolean =>
	data.companyName !== undefined &&
	data.companyName !== "" &&
	data.companySize !== undefined;

export const enterpriseEligible = andGuards(
	(data: RegistrationData) => data.plan === "enterprise",
	(data: RegistrationData) => data.companySize === "200+",
);
