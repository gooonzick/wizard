import { WizardStepLoadError } from "../errors";
import type { StepId, WizardContext } from "../types/base";
import type {
	LazyStepImplementation,
	WizardStepDefinition,
} from "../types/step";
import { combineValidators } from "./validators";

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

type LifecycleKey = "onEnter" | "onLeave" | "onSubmit";
type LifecycleFn<T> = NonNullable<WizardStepDefinition<T>[LifecycleKey]>;

/** Runs `first` then `second`, each awaited, with the same arguments. */
function sequence<T>(first: LifecycleFn<T>, second: LifecycleFn<T>) {
	return async (data: T, ctx: WizardContext): Promise<void> => {
		await first(data, ctx);
		await second(data, ctx);
	};
}

/**
 * Returns a new definition: the skeleton composed with every lazy hook the
 * loaded implementation defines. When only one side defines a hook, that
 * hook is used as-is (a loaded key that is `undefined` keeps the skeleton's
 * hook). When BOTH define it, they are composed — the loaded implementation
 * never silently drops a skeleton hook (e.g. a builder's `.required(...)`):
 * - `validate` → `combineValidators(skeleton, loaded)`: both must pass, their
 *   errors are merged;
 * - `onEnter` / `onLeave` / `onSubmit` → the skeleton hook runs first, then
 *   the loaded one, each awaited (a throw stops the sequence).
 * Keys outside `LAZY_KEYS` are ignored.
 */
export function mergeLazyImplementation<T>(
	skeleton: WizardStepDefinition<T>,
	impl: LazyStepImplementation<T>,
): WizardStepDefinition<T> {
	const merged: WizardStepDefinition<T> = { ...skeleton };
	// A loaded step is no longer lazy.
	delete merged.load;
	if (impl.validate) {
		merged.validate = skeleton.validate
			? combineValidators(skeleton.validate, impl.validate)
			: impl.validate;
	}
	for (const key of ["onEnter", "onLeave", "onSubmit"] as const) {
		const loaded = impl[key];
		if (loaded) {
			const own = skeleton[key];
			merged[key] = own ? sequence(own, loaded) : loaded;
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
