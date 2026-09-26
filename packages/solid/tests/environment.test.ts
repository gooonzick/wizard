import { createComputed, createRoot, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import { describe, expect, it } from "vitest";

/**
 * Guards the toolchain: if Vitest ever resolves Solid's SERVER build, signals
 * stop being reactive and every other test in this package becomes meaningless.
 */
describe("test environment", () => {
	it("E1: uses Solid's client build", () => {
		expect(isServer).toBe(false);
	});

	it("E2: signals are reactive", () => {
		const seen: number[] = [];
		const [count, setCount] = createSignal(0);
		const dispose = createRoot((d) => {
			// createComputed runs synchronously on creation and on every change.
			createComputed(() => {
				seen.push(count());
			});
			return d;
		});

		setCount(1);
		dispose();
		setCount(2);

		expect(seen).toEqual([0, 1]);
	});
});
