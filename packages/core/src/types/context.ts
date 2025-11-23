import type { WizardContext } from "./base";

/**
 * Creates a new wizard context with optional initial values
 */
export function createWizardContext(
	initial?: Partial<WizardContext>,
): WizardContext {
	return {
		...initial,
	};
}

/**
 * Type-safe context extension helper
 */
export type ExtendContext<Base extends WizardContext, Extra> = Base & Extra;

/**
 * Common context extensions
 */
export interface LoggerContext {
	logger?: {
		log: (message: string, ...args: unknown[]) => void;
		error: (message: string, error?: unknown) => void;
		debug: (message: string, ...args: unknown[]) => void;
	};
}

export interface RouterContext {
	router?: {
		navigate: (path: string) => void;
		back: () => void;
	};
}

export interface ApiContext {
	api?: {
		fetch: <T>(url: string, options?: RequestInit) => Promise<T>;
	};
}
