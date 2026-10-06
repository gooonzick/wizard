import { describe, expect, it, vi } from "vitest";
import { WizardError, WizardStepLoadError } from "../src/errors";
import {
	loadStepDefinition,
	mergeLazyImplementation,
	normalizeLazyModule,
} from "../src/machine/lazy-steps";
import type { WizardStepDefinition } from "../src/types/step";

describe("WizardStepLoadError", () => {
	it("carries the step id, a stable message, and the cause", () => {
		const cause = new Error("chunk failed");
		const err = new WizardStepLoadError("documents", { cause });

		expect(err).toBeInstanceOf(WizardError);
		expect(err.name).toBe("WizardStepLoadError");
		expect(err.message).toBe('Failed to load step "documents"');
		expect(err.stepId).toBe("documents");
		expect(err.cause).toBe(cause);
	});

	it("leaves cause undefined when none is given", () => {
		expect(new WizardStepLoadError("x").cause).toBeUndefined();
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
	it("loaded hooks override skeleton hooks; undefined keeps the skeleton hook", () => {
		const skeletonEnter = vi.fn();
		const skeletonValidate = vi.fn();
		const loadedEnter = vi.fn();
		const skeleton: WizardStepDefinition<D> = {
			id: "s",
			onEnter: skeletonEnter,
			validate: skeletonValidate,
			meta: { title: "S" },
		};

		const merged = mergeLazyImplementation(skeleton, {
			onEnter: loadedEnter,
			validate: undefined,
		});

		expect(merged.onEnter).toBe(loadedEnter);
		expect(merged.validate).toBe(skeletonValidate);
		expect(merged.meta).toEqual({ title: "S" });
		expect(skeleton.onEnter).toBe(skeletonEnter); // skeleton not mutated
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
