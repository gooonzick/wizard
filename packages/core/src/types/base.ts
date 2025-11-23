/**
 * Base utility types for WizardForm
 */

export type SyncOrAsync<T> = T | Promise<T>;

export type StepId = string;

export type ValidationResult = {
	valid: boolean;
	errors?: Record<string, string>;
};

/**
 * Base constraint for wizard data types.
 * Any object type with string keys is allowed - no need to extend Record<string, unknown>.
 *
 * @example
 * // Just define a regular interface - it works!
 * interface MyFormData {
 *   name: string;
 *   email: string;
 * }
 */
export type WizardData = { [key: string]: unknown };

/**
 * Extensible context used by all strategies
 * Can be extended with API clients, router, logger, feature flags, etc.
 */
export interface WizardContext {
	/** Enable debug logging */
	debug?: boolean;
	/** AbortSignal for cancellation support */
	signal?: AbortSignal;
	/** Additional context properties */
	[key: string]: unknown;
}
