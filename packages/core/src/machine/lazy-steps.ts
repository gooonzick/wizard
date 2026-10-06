import { WizardStepLoadError } from "../errors";
import type { StepId } from "../types/base";
import type {
	LazyStepImplementation,
	WizardStepDefinition,
} from "../types/step";

/** The only keys read from a loaded implementation (WIZ-013). */
const LAZY_KEYS = ["validate", "onEnter", "onLeave", "onSubmit"] as const;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Unwraps a module namespace (`{ default: impl }`) and returns the
 * implementation object, or `null` when the value is not an object.
 * When an object `default` export is present it wins; named exports are then
 * ignored.
 */
export function normalizeLazyModule<T>(
	raw: unknown,
): LazyStepImplementation<T> | null {
	if (!isObject(raw)) {
		return null;
	}
	if (Object.hasOwn(raw, "default") && isObject(raw.default)) {
		return raw.default as LazyStepImplementation<T>;
	}
	return raw as LazyStepImplementation<T>;
}

/**
 * Returns a new definition: the skeleton plus every lazy hook the loaded
 * implementation defines. A loaded key that is `undefined` keeps the
 * skeleton's hook; keys outside `LAZY_KEYS` are ignored.
 */
export function mergeLazyImplementation<T>(
	skeleton: WizardStepDefinition<T>,
	impl: LazyStepImplementation<T>,
): WizardStepDefinition<T> {
	const merged: WizardStepDefinition<T> = { ...skeleton };
	// A loaded step is no longer lazy.
	delete merged.load;
	for (const key of LAZY_KEYS) {
		const hook = impl[key];
		if (hook !== undefined) {
			(merged as unknown as Record<string, unknown>)[key] = hook;
		}
	}
	return merged;
}

/**
 * Runs `skeleton.load()` and returns the merged definition. Every failure —
 * a rejection, a synchronous throw, or a non-object result — rejects with
 * `WizardStepLoadError` (original failure as `cause`).
 */
export async function loadStepDefinition<T>(
	stepId: StepId,
	skeleton: WizardStepDefinition<T>,
): Promise<WizardStepDefinition<T>> {
	let raw: unknown;
	try {
		raw = await skeleton.load?.();
	} catch (cause) {
		throw new WizardStepLoadError(stepId, { cause });
	}
	const impl = normalizeLazyModule<T>(raw);
	if (!impl) {
		throw new WizardStepLoadError(stepId, {
			cause: new TypeError(
				`Step loader for "${stepId}" must resolve to an object`,
			),
		});
	}
	for (const key of LAZY_KEYS) {
		const hook: unknown = impl[key];
		if (hook !== undefined && typeof hook !== "function") {
			throw new WizardStepLoadError(stepId, {
				cause: new TypeError(
					`Step loader for "${stepId}" returned a non-function "${key}"`,
				),
			});
		}
	}
	return mergeLazyImplementation(skeleton, impl);
}
