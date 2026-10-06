import type { StepId } from "./types/base";

/**
 * Base error class for wizard-related errors
 */
export class WizardError extends Error {
	/**
	 * @param options.cause Optional underlying failure, stored as the native
	 *   (non-enumerable) `Error.cause`.
	 */
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "WizardError";
		// Maintains proper stack trace for where error was thrown (V8 engines)
		const ErrorCtor = Error as typeof Error & {
			captureStackTrace?: (
				target: object,
				constructorOpt?: NewableFunction,
			) => void;
		};
		if (ErrorCtor.captureStackTrace) {
			ErrorCtor.captureStackTrace(this, this.constructor);
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
 * Error thrown when serialized wizard state cannot be restored
 */
export class WizardRestoreError extends WizardError {
	constructor(message: string) {
		super(message);
		this.name = "WizardRestoreError";
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

/**
 * Error thrown when a lazy step's `load()` rejects or resolves to something
 * that is not a step implementation object (WIZ-013). The original failure is
 * available as the native `cause`, and its message is appended to this
 * error's message: `Failed to load step "<id>": <cause message>`.
 */
export class WizardStepLoadError extends WizardError {
	constructor(
		public readonly stepId: StepId,
		options?: { cause?: unknown },
	) {
		const base = `Failed to load step "${stepId}"`;
		const cause = options?.cause;
		super(
			cause === undefined
				? base
				: `${base}: ${cause instanceof Error ? cause.message : String(cause)}`,
			options,
		);
		this.name = "WizardStepLoadError";
	}
}
