import { describe, expect, it, vi } from "vitest";
import { createStep } from "../src/builders/create-step";
import { WizardError, WizardStepLoadError } from "../src/errors";
import {
	loadStepDefinition,
	mergeLazyImplementation,
	normalizeLazyModule,
} from "../src/machine/lazy-steps";
import type { WizardStepDefinition } from "../src/types/step";

describe("WizardStepLoadError", () => {
	it("carries the step id, the cause, and the cause's message", () => {
		const cause = new Error("chunk failed");
		const err = new WizardStepLoadError("documents", { cause });

		expect(err).toBeInstanceOf(WizardError);
		expect(err.name).toBe("WizardStepLoadError");
		expect(err.message).toBe('Failed to load step "documents": chunk failed');
		expect(err.stepId).toBe("documents");
		expect(err.cause).toBe(cause);
	});

	it("uses the native, non-enumerable cause", () => {
		const err = new WizardStepLoadError("documents", { cause: "offline" });
		expect(err.message).toBe('Failed to load step "documents": offline');
		expect(Object.getOwnPropertyDescriptor(err, "cause")?.enumerable).toBe(
			false,
		);
		expect(Object.keys(err)).not.toContain("cause");
	});

	it("keeps the plain message and no cause when none is given", () => {
		const err = new WizardStepLoadError("x");
		expect(err.message).toBe('Failed to load step "x"');
		expect(err.cause).toBeUndefined();
		expect("cause" in err).toBe(false);
	});
});

type D = { name: string };

describe("normalizeLazyModule", () => {
	it("returns a bare implementation object as-is", () => {
		const impl = { onEnter: vi.fn() };
		expect(normalizeLazyModule<D>(impl)).toBe(impl);
	});

	it("unwraps a module namespace with an object default export", () => {
		const impl = { onEnter: vi.fn() };
		expect(normalizeLazyModule<D>({ default: impl })).toBe(impl);
	});

	it("returns null for non-objects", () => {
		expect(normalizeLazyModule<D>(42)).toBeNull();
		expect(normalizeLazyModule<D>(null)).toBeNull();
		expect(normalizeLazyModule<D>(undefined)).toBeNull();
	});
});

describe("mergeLazyImplementation", () => {
	it("a hook defined only on one side is used as-is; the skeleton is not mutated", () => {
		const skeletonEnter = vi.fn();
		const skeletonValidate = vi.fn();
		const loadedLeave = vi.fn();
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			onEnter: skeletonEnter,
			validate: skeletonValidate,
			meta: { title: "S" },
		};

		const merged = mergeLazyImplementation(skeleton, {
			onLeave: loadedLeave,
			validate: undefined,
		});

		expect(merged.onEnter).toBe(skeletonEnter);
		expect(merged.validate).toBe(skeletonValidate);
		expect(merged.onLeave).toBe(loadedLeave);
		expect(merged.meta).toEqual({ title: "S" });
		expect(skeleton.onLeave).toBeUndefined(); // skeleton not mutated
	});

	it("composes lifecycle hooks defined on both sides: skeleton first, then loaded, sequentially", async () => {
		for (const key of ["onEnter", "onLeave", "onSubmit"] as const) {
			const order: string[] = [];
			let releaseSkeleton!: () => void;
			const skeletonHook = vi.fn(
				() =>
					new Promise<void>((resolve) => {
						releaseSkeleton = () => {
							order.push("skeleton");
							resolve();
						};
					}),
			);
			const loadedHook = vi.fn(() => {
				order.push("loaded");
			});
			const merged = mergeLazyImplementation<D>(
				{ id: "s", [key]: skeletonHook },
				{ [key]: loadedHook },
			);

			const data = { name: "x" };
			const done = merged[key]?.(data, {});
			await Promise.resolve();
			expect(skeletonHook).toHaveBeenCalledWith(data, {});
			expect(loadedHook).not.toHaveBeenCalled(); // waits for the skeleton
			releaseSkeleton();
			await done;
			expect(loadedHook).toHaveBeenCalledWith(data, {});
			expect(order).toEqual(["skeleton", "loaded"]);
		}
	});

	it("composes validators defined on both sides: both must pass, errors are merged", async () => {
		const merged = mergeLazyImplementation<D>(
			{
				id: "s",
				validate: (d) =>
					d.name ? { valid: true } : { valid: false, errors: { name: "req" } },
			},
			{ validate: () => ({ valid: false, errors: { other: "bad" } }) },
		);
		await expect(merged.validate?.({ name: "" }, {})).resolves.toEqual({
			valid: false,
			errors: { name: "req", other: "bad" },
		});
		await expect(merged.validate?.({ name: "x" }, {})).resolves.toEqual({
			valid: false,
			errors: { other: "bad" },
		});

		const allValid = mergeLazyImplementation<D>(
			{ id: "s", validate: () => ({ valid: true }) },
			{ validate: () => ({ valid: true }) },
		);
		await expect(allValid.validate?.({ name: "" }, {})).resolves.toEqual({
			valid: true,
			errors: undefined,
		});
	});

	it("a builder-required field still fails when the loaded validator passes", async () => {
		const step = createStep<{ passport: string }>("documents")
			.required("passport")
			.lazy(async () => ({ validate: () => ({ valid: true }) }))
			.build();
		const merged = await loadStepDefinition(step.id, step);
		const result = await merged.validate?.({ passport: "" }, {});
		expect(result?.valid).toBe(false);
		expect(result?.errors).toHaveProperty("passport");
	});

	it("does not copy load into the merged definition", () => {
		const load = async () => ({});
		const skeleton: WizardStepDefinition<D> = { id: "s", load };
		const merged = mergeLazyImplementation(skeleton, { onEnter: vi.fn() });
		expect(merged.load).toBeUndefined();
		expect("load" in merged).toBe(false);
		expect(skeleton.load).toBe(load);
	});

	it("ignores keys outside the lazy implementation", () => {
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			next: { type: "static", to: "t" },
		};
		const merged = mergeLazyImplementation(skeleton, {
			next: { type: "static", to: "hijack" },
		} as never);
		expect(merged.next).toEqual({ type: "static", to: "t" });
	});
});

describe("loadStepDefinition", () => {
	it("runs the loader and returns the merged definition", async () => {
		const onEnter = vi.fn();
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			load: async () => ({ default: { onEnter } }),
		};
		const merged = await loadStepDefinition("s", skeleton);
		expect(merged.onEnter).toBe(onEnter);
		expect(merged.id).toBe("s");
	});

	it("wraps a rejection in WizardStepLoadError with the cause", async () => {
		const cause = new Error("network");
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			load: () => Promise.reject(cause),
		};
		const err = await loadStepDefinition("s", skeleton).catch((e) => e);
		expect(err).toBeInstanceOf(WizardStepLoadError);
		expect(err.stepId).toBe("s");
		expect(err.cause).toBe(cause);
	});

	it("wraps a synchronous loader throw", async () => {
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			load: () => {
				throw new Error("sync");
			},
		};
		await expect(loadStepDefinition("s", skeleton)).rejects.toBeInstanceOf(
			WizardStepLoadError,
		);
	});

	it("rejects a non-function loaded hook with a TypeError cause", async () => {
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			load: async () => ({ validate: "x" }) as never,
		};
		const err = await loadStepDefinition("s", skeleton).catch((e) => e);
		expect(err).toBeInstanceOf(WizardStepLoadError);
		expect(err.cause).toBeInstanceOf(TypeError);
	});

	it("rejects a non-object result with a TypeError cause", async () => {
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			load: async () => 42 as never,
		};
		const err = await loadStepDefinition("s", skeleton).catch((e) => e);
		expect(err).toBeInstanceOf(WizardStepLoadError);
		expect(err.cause).toBeInstanceOf(TypeError);
	});
});
