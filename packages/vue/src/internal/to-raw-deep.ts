import { isProxy, isRef, toRaw, unref } from "vue";

/**
 * True for plain objects (`{}` literals / `Object.create(null)`), which are the
 * only non-array containers this module walks into. Class instances, Date, Map,
 * Set, RegExp, typed arrays, etc. are left as-is (after `toRaw`).
 */
function isPlainObject(value: object): value is Record<PropertyKey, unknown> {
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Whether `value` (or anything reachable through plain objects / arrays) is a
 * Vue ref or reactive/readonly proxy. `visited` guards cycles.
 */
function containsVueReactivity(
	value: unknown,
	visited: WeakSet<object>,
): boolean {
	if (isRef(value) || isProxy(value)) {
		return true;
	}
	if (typeof value !== "object" || value === null) {
		return false;
	}
	if (visited.has(value)) {
		return false;
	}
	visited.add(value);
	if (Array.isArray(value)) {
		return value.some((item) => containsVueReactivity(item, visited));
	}
	if (isPlainObject(value)) {
		return Reflect.ownKeys(value).some((key) =>
			containsVueReactivity(value[key], visited),
		);
	}
	return false;
}

function unwrap(value: unknown, seen: WeakMap<object, unknown>): unknown {
	let current = value;
	while (isRef(current)) {
		current = unref(current);
	}
	if (typeof current !== "object" || current === null) {
		return current;
	}
	const raw = toRaw(current);
	const existing = seen.get(raw);
	if (existing !== undefined) {
		return existing;
	}
	if (Array.isArray(raw)) {
		const out: unknown[] = [];
		seen.set(raw, out);
		for (const item of raw) {
			out.push(unwrap(item, seen));
		}
		return out;
	}
	if (isPlainObject(raw)) {
		const out: Record<PropertyKey, unknown> =
			Object.getPrototypeOf(raw) === null ? Object.create(null) : {};
		seen.set(raw, out);
		for (const key of Reflect.ownKeys(raw)) {
			const descriptor = Object.getOwnPropertyDescriptor(raw, key);
			if (descriptor?.enumerable) {
				out[key] = unwrap(raw[key], seen);
			}
		}
		return out;
	}
	// Date / Map / Set / other structured-cloneable instances: kept as-is.
	seen.set(raw, raw);
	return raw;
}

/**
 * Recursively strips Vue reactivity so the value can be handed to the core
 * machine, which deep-clones with `structuredClone` (and that throws
 * `DataCloneError` on Proxy objects).
 *
 * - Refs are unwrapped to their value; reactive/readonly proxies to their raw
 *   target.
 * - Plain objects and arrays are walked; other instances (Date, Map, Set, …)
 *   are kept as-is after `toRaw`.
 * - Cycles are preserved: a revisited object maps to the same unwrapped copy.
 * - Copy-on-write: if nothing in the graph is a ref/proxy, the input is
 *   returned unchanged (same reference), so identity-based semantics such as
 *   `updateField`'s `Object.is` no-op and `updateData`'s same-reference
 *   handling are preserved for plain data.
 */
export function toRawDeep<V>(value: V): V {
	if (!containsVueReactivity(value, new WeakSet())) {
		return value;
	}
	return unwrap(value, new WeakMap()) as V;
}
