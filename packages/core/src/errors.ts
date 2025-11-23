import type { StepId } from "./types/base";

/**
 * Base error class for wizard-related errors
 */
export class WizardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WizardError";
		// Maintains proper stack trace for where error was thrown (V8 engines)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}

/**
 * Error thrown when validation fails
 */
export class WizardValidationError extends WizardError {
	constructor(public readonly errors: Record<string, string>) {
		super("Validation failed");
		this.name = "WizardValidationError";
	}
}

/**
 * Error thrown when navigation fails
 */
export class WizardNavigationError extends WizardError {
	constructor(
		message: string,
		public readonly stepId?: StepId,
		public readonly reason?: "disabled" | "not-found" | "busy" | "circular",
	) {
		super(message);
		this.name = "WizardNavigationError";
	}
}

/**
 * Error thrown when wizard configuration is invalid
 */
export class WizardConfigurationError extends WizardError {
	constructor(message: string) {
		super(message);
		this.name = "WizardConfigurationError";
	}
}

/**
 * Error thrown when operation is aborted
 */
export class WizardAbortError extends WizardError {
	constructor(message = "Operation was aborted") {
		super(message);
		this.name = "WizardAbortError";
	}
}
