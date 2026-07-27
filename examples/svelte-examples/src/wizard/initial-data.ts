import type { SignupData } from "./types";

export const initialData: SignupData = {
	name: "",
	email: "",
	plan: "basic",
};

export const PLANS = ["basic", "pro", "enterprise"] as const;
