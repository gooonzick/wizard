import { describe, expect, it } from "vitest";
import { isProxy, isRef, reactive, readonly, ref, shallowReactive } from "vue";
import { toRawDeep } from "../../src/internal/to-raw-deep";

/** Walks plain objects/arrays and asserts nothing reachable is a ref/proxy. */
function expectNoReactivity(value: unknown, seen = new Set<unknown>()): void {
	expect(isRef(value)).toBe(false);
	expect(isProxy(value)).toBe(false);
	if (typeof value !== "object" || value === null || seen.has(value)) {
		return;
	}
	seen.add(value);
	if (
		Array.isArray(value) ||
		Object.getPrototypeOf(value) === Object.prototype
	) {
		for (const child of Object.values(value)) {
			expectNoReactivity(child, seen);
		}
	}
}

describe("toRawDeep", () => {
	it("returns primitives unchanged", () => {
		expect(toRawDeep(1)).toBe(1);
		expect(toRawDeep("a")).toBe("a");
		expect(toRawDeep(null)).toBe(null);
		expect(toRawDeep(undefined)).toBe(undefined);
		expect(Number.isNaN(toRawDeep(Number.NaN))).toBe(true);
	});

	it("returns plain data by reference (copy-on-write)", () => {
		const plain = { a: 1, nested: { b: [1, 2, { c: 3 }] } };
		expect(toRawDeep(plain)).toBe(plain);
		const list = [1, { a: 2 }];
		expect(toRawDeep(list)).toBe(list);
	});

	it("unwraps nested reactive() objects into structured-cloneable data", () => {
		const form = reactive({
			name: "Ada",
			address: { city: "London", tags: ["a", "b"] },
		});
		const result = toRawDeep(form);

		expectNoReactivity(result);
		expect(result).toEqual({
			name: "Ada",
			address: { city: "London", tags: ["a", "b"] },
		});
		expect(() => structuredClone(result)).not.toThrow();
		expect(() => structuredClone(form)).toThrow();
	});

	it("unwraps plain containers holding reactive children", () => {
		const inner = reactive({ v: 1 });
		const holder = { inner, list: [reactive({ w: 2 })] };
		const result = toRawDeep(holder);

		expect(result).not.toBe(holder);
		expectNoReactivity(result);
		expect(result).toEqual({ inner: { v: 1 }, list: [{ w: 2 }] });
		expect(() => structuredClone(result)).not.toThrow();
	});

	it("unwraps refs, including refs nested inside reactive() and refs of objects", () => {
		expect(toRawDeep(ref(5))).toBe(5);

		const objRef = ref({ a: { b: 1 } });
		const unwrappedObj = toRawDeep(objRef);
		expectNoReactivity(unwrappedObj);
		expect(unwrappedObj).toEqual({ a: { b: 1 } });

		// reactive() auto-unwraps refs on access, but the raw target stores the Ref.
		const form = reactive({ count: ref(3), nested: { label: ref("x") } });
		const result = toRawDeep(form) as unknown as {
			count: number;
			nested: { label: string };
		};
		expectNoReactivity(result);
		expect(result).toEqual({ count: 3, nested: { label: "x" } });
		expect(() => structuredClone(result)).not.toThrow();
	});

	it("unwraps reactive arrays and readonly/shallowReactive proxies", () => {
		const list = reactive([{ a: 1 }, { a: 2 }]);
		const listResult = toRawDeep(list);
		expect(Array.isArray(listResult)).toBe(true);
		expectNoReactivity(listResult);
		expect(listResult).toEqual([{ a: 1 }, { a: 2 }]);

		const ro = readonly(reactive({ deep: { x: 1 } }));
		expectNoReactivity(toRawDeep(ro));
		expect(toRawDeep(ro)).toEqual({ deep: { x: 1 } });

		const shallow = shallowReactive({ child: reactive({ y: 2 }) });
		expectNoReactivity(toRawDeep(shallow));
		expect(toRawDeep(shallow)).toEqual({ child: { y: 2 } });
	});

	it("preserves cycles, mapping revisited objects to the same unwrapped copy", () => {
		const inner = reactive({ v: 1 });
		const root: Record<string, unknown> = { inner, again: inner };
		root.self = root;

		const result = toRawDeep(root);
		expect(result).not.toBe(root);
		expect(result.self).toBe(result);
		expect(result.inner).toBe(result.again);
		expectNoReactivity(result);
		expect(() => structuredClone(result)).not.toThrow();
	});

	it("keeps Date/Map/Set instances as-is after toRaw", () => {
		const date = new Date("2024-01-02T03:04:05.000Z");
		const map = new Map([["k", 1]]);
		const set = new Set([1, 2]);
		const form = reactive({ date, map, set });

		const result = toRawDeep(form);
		expect(result.date).toBe(date);
		expect(result.date).toBeInstanceOf(Date);
		expect(result.map).toBe(map);
		expect(result.set).toBe(set);
		expectNoReactivity(result);
		expect(structuredClone(result).date.getTime()).toBe(date.getTime());
	});
});
