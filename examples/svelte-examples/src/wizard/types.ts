/**
 * Declared as a type alias (not an interface) on purpose: TypeScript only grants
 * an implicit index signature to type aliases, so this satisfies `WizardData`
 * while keeping `keyof SignupData` narrow.
 */
export type SignupData = {
	name: string;
	email: string;
	plan: string;
};
