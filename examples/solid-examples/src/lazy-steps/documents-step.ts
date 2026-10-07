import type { LazyStepImplementation } from "@gooonzick/wizard-core";
import type { LazyDemoData } from "./types";

/**
 * Loaded on first use through `.lazy()` — Vite emits this module as its own
 * chunk (watch the Network tab). In a real app a heavy Zod/Valibot schema
 * would live here.
 */
export const documentsStep: LazyStepImplementation<LazyDemoData> = {
	validate: (data) =>
		/^[A-Z]{2}\d{7}$/.test(data.passport)
			? { valid: true }
			: {
					valid: false,
					errors: { passport: "Passport number must look like AB1234567" },
				},
	onEnter: () => {
		console.info("[lazy-steps] documents implementation loaded and entered");
	},
};
