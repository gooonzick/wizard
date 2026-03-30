import { vi } from "vitest";
import {
	createLinearWizard,
	createWizard,
} from "../src/builders/create-wizard";
import type { WizardEvents } from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

// ── Shared data types ──────────────────────────────────────────────

export interface SimpleData extends Record<string, unknown> {
	name: string;
	email: string;
}

export interface FormData extends Record<string, unknown> {
	name: string;
	email: string;
	age: number;
	enabled: boolean;
}

// ── Reusable wizard definitions ────────────────────────────────────

/** Simple 3-step linear wizard with no validation */
export function createSimpleLinearDefinition(): WizardDefinition<SimpleData> {
	return createLinearWizard<SimpleData>({
		id: "simple-linear",
		steps: [
			{ id: "step1", title: "Step 1" },
			{ id: "step2", title: "Step 2" },
			{ id: "step3", title: "Step 3" },
		],
	});
}

/** 3-step linear wizard with validation on step1 */
export function createValidatedDefinition(): WizardDefinition<SimpleData> {
	return createLinearWizard<SimpleData>({
		id: "validated",
		steps: [
			{
				id: "step1",
				title: "Step 1",
				validate: async (data) => ({
					valid: !!data.name,
					errors: data.name ? undefined : { name: "Name is required" },
				}),
			},
			{
				id: "step2",
				title: "Step 2",
				validate: async (data) => ({
					valid: !!data.email,
					errors: data.email ? undefined : { email: "Email is required" },
				}),
			},
			{ id: "step3", title: "Step 3" },
		],
	});
}

/** Wizard with conditional branching and enabled guards */
export function createConditionalDefinition(): WizardDefinition<FormData> {
	return createWizard<FormData>("conditional")
		.step("personal", (s) =>
			s
				.title("Personal Info")
				.validate((data: FormData) => ({
					valid: data.name.length > 0 && data.age > 0,
					errors: !data.name ? { name: "Required" } : undefined,
				}))
				.next("preferences"),
		)
		.step("preferences", (s) =>
			s
				.title("Preferences")
				.previous("personal")
				.nextWhen([
					{ when: (d: FormData) => d.enabled, to: "optional" },
					{ when: () => true, to: "summary" },
				]),
		)
		.step("optional", (s) =>
			s
				.title("Optional Details")
				.enabled((d: FormData) => d.enabled)
				.previous("preferences")
				.next("summary"),
		)
		.step("summary", (s) => s.title("Summary").previous("preferences"))
		.build();
}

// ── Spy helpers ────────────────────────────────────────────────────

/** Creates a full set of event spies */
export function createEventSpies<T extends Record<string, unknown>>(): Required<
	WizardEvents<T>
> {
	return {
		onStateChange: vi.fn(),
		onStepEnter: vi.fn(),
		onStepLeave: vi.fn(),
		onValidation: vi.fn(),
		onSubmit: vi.fn(),
		onComplete: vi.fn(),
		onError: vi.fn(),
	};
}
