# WIZ-013 Lazy Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a wizard step load its heavy implementation (`validate` / `onEnter` / `onLeave` / `onSubmit`) lazily via `load: () => import(...)`, expose `isLoadingStep` + `preloadStep` through core, `wizard-state` and every binding, and ship a "Lazy Steps" demo in all four example apps.

**Architecture:** The step skeleton (`id`, `next`, `previous`, `enabled`, `meta`) stays eager, so nothing in the machine that reads steps synchronously changes. A new pure module `lazy-steps.ts` loads + normalises + merges an implementation; `WizardMachine` caches loads per step (shared in-flight promise, evicted on failure), loads the current/target step before any hook that needs it, tracks foreground loads in `isLoadingStep`, and reports each failed attempt once with the new plugin phase `"load"`. `WizardStateManager` mirrors `snapshot.isLoadingStep` into its loading slice; bindings expose it next to `isNavigating` and get `actions.preloadStep`.

**Tech Stack:** TypeScript (strict), Vitest, Biome (tabs, double quotes), pnpm + Turbo, changesets; React 19 / Vue 3 / Svelte 5 / Solid 1.x bindings; Vite example apps.

**Spec:** `docs/superpowers/specs/2026-10-06-wiz-013-lazy-steps-design.md` — read it first. Section numbers below (§4 etc.) refer to it.

**Branch:** `feat/wiz-013-lazy-steps` (already checked out; spec commits are on it).

**Conventions (AGENTS.md):** tabs, double quotes, semicolons; kebab-case files; tests assert through public API / events / `snapshot` (no private fields). Run single core test files with `pnpm turbo run test --filter=@gooonzick/wizard-core -- <pattern>` or `cd packages/core && npx vitest run tests/<file>`.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `packages/core/src/types/step.ts` | modify | `LazyStepImplementation`, `StepLoader`, `WizardStepDefinition.load` |
| `packages/core/src/errors.ts` | modify | `WizardStepLoadError` |
| `packages/core/src/plugins/types.ts` | modify | `ErrorContext.phase` += `"load"` |
| `packages/core/src/plugins/plugin-host.ts` | modify | phase unions → `ErrorContext<unknown>["phase"]` |
| `packages/core/src/machine/lazy-steps.ts` | **create** | pure: normalise module, merge hooks, run loader → merged definition |
| `packages/core/src/machine/wizard-machine.ts` | modify | cache, `isLoadingStep`, load call sites, `preloadStep`, single reporting |
| `packages/core/src/builders/create-step.ts` | modify | `StepBuilder.lazy()` |
| `packages/core/src/index.ts` | modify | exports |
| `packages/core/tests/lazy-steps-module.test.ts` | **create** | unit tests for `lazy-steps.ts` |
| `packages/core/tests/lazy-steps.test.ts` | **create** | machine behaviour tests |
| `packages/core/tests/builders.test.ts`, `types.test.ts` | modify | `.lazy()` + type tests |
| `packages/state/src/types.ts`, `manager.ts`, `actions.ts` | modify | `isLoadingStep`, `TrackedLoadingFlag`, `preloadStep` action |
| `packages/state/tests/lazy-loading.test.ts` | **create** | manager tests |
| `packages/react/src/use-wizard.tsx`, `use-wizard-granular.tsx` | modify | expose `isLoadingStep`, `preloadStep` |
| `packages/vue/src/types.ts`, `use-wizard.ts` | modify | same |
| `packages/svelte/src/types.ts`, `runes/types.ts`, `runes/create-wizard.svelte.ts` | modify | same |
| `packages/solid/src/types.ts`, `create-wizard.ts` | modify | same |
| `packages/{react,vue,svelte,solid}/tests/lazy-steps.test.*` | **create** | one smoke test each |
| `examples/*/src/lazy-steps/*` + example components + app tab wiring | **create/modify** | demo |
| docs (`packages/docs/guide/**`, `docs/**`), READMEs, `.agents/skills/wizard-library/references/*` | modify | documentation |
| `.changeset/wiz-013-lazy-steps.md` | **create** | release note |
| `docs/ROADMAP.md` | modify | WIZ-013 done |

---

## Task 1: Core types, error class, `"load"` phase

**Files:**
- Modify: `packages/core/src/types/step.ts`
- Modify: `packages/core/src/errors.ts`
- Modify: `packages/core/src/plugins/types.ts:34-40`
- Modify: `packages/core/src/plugins/plugin-host.ts:16-19,238-241`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/lazy-steps-module.test.ts` (create; error part only here)

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/lazy-steps-module.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WizardError, WizardStepLoadError } from "../src/errors";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run tests/lazy-steps-module.test.ts`
Expected: FAIL — `WizardStepLoadError` is not exported from `../src/errors`.

- [ ] **Step 3: Implement**

Append to `packages/core/src/errors.ts` (after `WizardAbortError`):

```ts
/**
 * Error thrown when a lazy step's `load()` rejects or resolves to something
 * that is not a step implementation object (WIZ-013). The original failure is
 * available as `cause`.
 */
export class WizardStepLoadError extends WizardError {
	constructor(
		public readonly stepId: StepId,
		options?: { cause?: unknown },
	) {
		super(`Failed to load step "${stepId}"`);
		this.name = "WizardStepLoadError";
		if (options && "cause" in options) {
			this.cause = options.cause;
		}
	}
}
```

In `packages/core/src/types/step.ts`, add `load` to `WizardStepDefinition<T>` (after `onSubmit`, before `meta`):

```ts
	// Lazily loaded implementation (WIZ-013): validate / onEnter / onLeave /
	// onSubmit. Transitions, `enabled` and `meta` always stay on the skeleton.
	load?: StepLoader<T>;
```

and append to the same file:

```ts
/**
 * The part of a step that may be loaded lazily (WIZ-013). Everything the
 * machine needs synchronously — transitions, `enabled`, `meta` — stays on the
 * eager step skeleton, so progress, `isLastStep` and disabled-step skipping
 * never wait for a load.
 */
export type LazyStepImplementation<T> = Pick<
	WizardStepDefinition<T>,
	"validate" | "onEnter" | "onLeave" | "onSubmit"
>;

/**
 * Loads a step implementation (WIZ-013), typically `() => import("./step")`.
 * A module namespace with a `default` export is accepted as well. Hooks from
 * the loaded implementation override same-named hooks on the skeleton.
 */
export type StepLoader<T> = () => Promise<
	LazyStepImplementation<T> | { default: LazyStepImplementation<T> }
>;
```

In `packages/core/src/plugins/types.ts`, extend the union in `ErrorContext`:

```ts
	phase:
		| "validation"
		| "transition"
		| "lifecycle"
		| "submit"
		| "data"
		| "state"
		| "load";
```

In `packages/core/src/plugins/plugin-host.ts`, replace both literal unions (`PluginErrorReporter`'s `phase?` and `runIsolated`'s `phase?`) with `ErrorContext<unknown>["phase"]`, adding `ErrorContext` to the existing `import type { … } from "./types"` if it is not imported yet:

```ts
export type PluginErrorReporter = (
	error: unknown,
	phase?: ErrorContext<unknown>["phase"],
) => void;
```

```ts
	private async runIsolated(
		fn: () => void | Promise<void>,
		phase?: ErrorContext<unknown>["phase"],
	): Promise<void> {
```

In `packages/core/src/index.ts`: add `WizardStepLoadError` to the `./errors` export list (keep it alphabetical — after `WizardRestoreError`), and add `LazyStepImplementation` and `StepLoader` to the `./types/step` type export list (alphabetical).

- [ ] **Step 4: Run test + typecheck**

Run: `cd packages/core && npx vitest run tests/lazy-steps-module.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; no type errors. (If `tsc -p` is not the package's pattern, use `pnpm --filter @gooonzick/wizard-core typecheck`.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/types/step.ts packages/core/src/plugins/types.ts packages/core/src/plugins/plugin-host.ts packages/core/src/index.ts packages/core/tests/lazy-steps-module.test.ts
git commit -m "feat(core): add lazy step types, WizardStepLoadError and load error phase (WIZ-013)"
```

---

## Task 2: Pure loader module `lazy-steps.ts`

**Files:**
- Create: `packages/core/src/machine/lazy-steps.ts`
- Test: `packages/core/tests/lazy-steps-module.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/lazy-steps-module.test.ts` (merge the imports at the top of the file):

```ts
import { vi } from "vitest";
import {
	loadStepDefinition,
	mergeLazyImplementation,
	normalizeLazyModule,
} from "../src/machine/lazy-steps";
import type { WizardStepDefinition } from "../src/types/step";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/lazy-steps-module.test.ts`
Expected: FAIL — cannot resolve `../src/machine/lazy-steps`.

- [ ] **Step 3: Implement**

Create `packages/core/src/machine/lazy-steps.ts`:

```ts
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
	for (const key of LAZY_KEYS) {
		const hook = impl[key];
		if (hook !== undefined) {
			(merged as Record<string, unknown>)[key] = hook;
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
	return mergeLazyImplementation(skeleton, impl);
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/lazy-steps-module.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/machine/lazy-steps.ts packages/core/tests/lazy-steps-module.test.ts
git commit -m "feat(core): add lazy step loader module (WIZ-013)"
```

---

## Task 3: `StepBuilder.lazy()` and type tests

**Files:**
- Modify: `packages/core/src/builders/create-step.ts` (after `onSubmit()`, ~line 155)
- Test: `packages/core/tests/builders.test.ts`, `packages/core/tests/types.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/builders.test.ts` (add `createStep` / `createWizard` imports if missing — check the file's existing imports first):

```ts
describe("StepBuilder.lazy (WIZ-013)", () => {
	it("sets the step's load function", () => {
		const loader = async () => ({ onEnter: () => {} });
		const step = createStep<{ name: string }>("heavy")
			.next("done")
			.lazy(loader)
			.build();
		expect(step.load).toBe(loader);
		expect(step.next).toEqual({ type: "static", to: "done" });
	});

	it("is chainable from createWizard().step()", () => {
		const loader = async () => ({});
		const def = createWizard<{ name: string }>("w")
			.initialStep("a")
			.step("a", (s) => s.lazy(loader))
			.build();
		expect(def.steps.a.load).toBe(loader);
	});
});
```

Append to `packages/core/tests/types.test.ts` (add the imports to the top import block):

```ts
import type { LazyStepImplementation, StepLoader } from "../src/types/step";

describe("WIZ-013 lazy step types", () => {
	type D = { name: string };

	test("LazyStepImplementation has exactly the four hook keys", () => {
		expectTypeOf<keyof LazyStepImplementation<D>>().toEqualTypeOf<
			"validate" | "onEnter" | "onLeave" | "onSubmit"
		>();
	});

	test("StepLoader accepts bare and default-export module shapes", () => {
		expectTypeOf<() => Promise<{ onEnter: () => void }>>().toMatchTypeOf<
			StepLoader<D>
		>();
		expectTypeOf<
			() => Promise<{ default: { validate: () => { valid: true } } }>
		>().toMatchTypeOf<StepLoader<D>>();
	});

	test("StepLoader rejects results that only carry skeleton keys", () => {
		expectTypeOf<
			() => Promise<{ next: { type: "static"; to: string } }>
		>().not.toMatchTypeOf<StepLoader<D>>();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/builders.test.ts tests/types.test.ts --typecheck`
Expected: FAIL — `lazy` does not exist on `StepBuilder`.

- [ ] **Step 3: Implement**

In `packages/core/src/builders/create-step.ts`, add `StepLoader` to the `../types/step` type import, then after `onSubmit()`:

```ts
	/**
	 * Loads this step's implementation (validate / onEnter / onLeave /
	 * onSubmit) lazily on first use (WIZ-013), e.g.
	 * `.lazy(() => import("./steps/documents"))`. Transitions, `enabled` and
	 * meta set on this builder stay eager.
	 */
	lazy(loader: StepLoader<T>): this {
		this.step.load = loader;
		return this;
	}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/builders.test.ts tests/types.test.ts --typecheck`
Expected: PASS. If the core vitest config does not run type tests with `--typecheck`, run `pnpm --filter @gooonzick/wizard-core typecheck` instead to verify the `expectTypeOf` assertions compile (they are compile-time checks).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/builders/create-step.ts packages/core/tests/builders.test.ts packages/core/tests/types.test.ts
git commit -m "feat(core): add StepBuilder.lazy() (WIZ-013)"
```

---

## Task 4: Machine plumbing — cache, `isLoadingStep`, `currentStep`, `preloadStep`

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts`
- Test: `packages/core/tests/lazy-steps.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/lazy-steps.test.ts` with the shared helpers (later tasks append `describe` blocks to this file):

```ts
import { describe, expect, it, vi } from "vitest";
import {
	WizardNavigationError,
	WizardStepLoadError,
	WizardValidationError,
} from "../src/errors";
import {
	WizardMachine,
	type WizardEvents,
	type WizardSerializedState,
	type WizardState,
} from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import type { WizardDefinition } from "../src/types/definition";
import type {
	LazyStepImplementation,
	StepLoader,
	WizardStepDefinition,
} from "../src/types/step";

type Data = { name: string; passport: string };
const initialData: Data = { name: "", passport: "" };

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<V = void>() {
	let resolve!: (v: V) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<V>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** A loader whose every call parks on a fresh deferred the test settles. */
function controlledLoader(impl: LazyStepImplementation<Data> = {}) {
	const pending: Array<ReturnType<typeof deferred<LazyStepImplementation<Data>>>> =
		[];
	const load = vi.fn(() => {
		const d = deferred<LazyStepImplementation<Data>>();
		pending.push(d);
		return d.promise;
	});
	return {
		load: load as unknown as StepLoader<Data> & typeof load,
		resolve: (i = pending.length - 1) => pending[i].resolve(impl),
		reject: (error: unknown = new Error("chunk failed"), i = pending.length - 1) =>
			pending[i].reject(error),
	};
}

/** account -> documents (lazy) -> summary */
function lazyDefinition(
	load: StepLoader<Data>,
	documents: Partial<WizardStepDefinition<Data>> = {},
): WizardDefinition<Data> {
	return {
		id: "lazy",
		initialStepId: "account",
		steps: {
			account: { id: "account", next: { type: "static", to: "documents" } },
			documents: {
				id: "documents",
				previous: { type: "static", to: "account" },
				next: { type: "static", to: "summary" },
				meta: { title: "Documents" },
				load,
				...documents,
			},
			summary: { id: "summary", previous: { type: "static", to: "documents" } },
		},
	};
}

function createMachine(
	definition: WizardDefinition<Data>,
	events: WizardEvents<Data> = {},
	plugins?: WizardPlugin<Data>[],
) {
	const states: Array<Pick<WizardState<Data>, "currentStepId" | "isLoadingStep">> =
		[];
	const machine = new WizardMachine<Data>(
		definition,
		{},
		initialData,
		{
			...events,
			onStateChange: (s) => {
				states.push({ currentStepId: s.currentStepId, isLoadingStep: s.isLoadingStep });
				events.onStateChange?.(s);
			},
		},
		plugins,
	);
	return { machine, states };
}

const documentsSnapshot: WizardSerializedState<Data> = {
	version: 1,
	currentStepId: "documents",
	data: initialData,
	isValid: true,
	isCompleted: false,
	stepStatuses: { account: "completed", documents: "active", summary: "pristine" },
	visitedSteps: ["account", "documents"],
	history: ["account", "documents"],
};

describe("WIZ-013 lazy steps — plumbing", () => {
	it("snapshot.isLoadingStep starts false and is not serialized", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect("isLoadingStep" in machine.serialize()).toBe(false);
	});

	it("currentStep is the skeleton before load and the merged definition after", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ validate }))),
		);
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		expect(machine.currentStep.validate).toBeUndefined();
		expect(machine.currentStep.meta?.title).toBe("Documents");

		await machine.preloadStep("documents");
		expect(machine.currentStep.validate).toBe(validate);
	});

	it("preloadStep never flips isLoadingStep and later navigation reuses the load", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await flush();
		const before = states.length;

		await machine.preloadStep("documents");
		expect(states.length).toBe(before);
		expect(load).toHaveBeenCalledTimes(1);

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).toHaveBeenCalledTimes(1);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
	});

	it("preloadStep rejects for an unknown step id", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		const error = await machine.preloadStep("nope").catch((e) => e);
		expect(error).toBeInstanceOf(WizardNavigationError);
		expect(error.reason).toBe("not-found");
	});

	it("preloadStep failure rejects without onError, and the next attempt retries", async () => {
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({});
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), { onError });

		await expect(machine.preloadStep("documents")).rejects.toBeInstanceOf(
			WizardStepLoadError,
		);
		expect(onError).not.toHaveBeenCalled();

		await machine.preloadStep("documents");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("preloadStep resolves immediately for steps without load", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await expect(machine.preloadStep("account")).resolves.toBeUndefined();
	});

	it("progress, isLastStep and getAvailableSteps do not trigger loads", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		const eager = createMachine(lazyDefinition(undefined as never)).machine;
		await flush();

		expect(machine.snapshot.progress).toEqual(eager.snapshot.progress);
		expect(await machine.getAvailableSteps()).toEqual(
			await eager.getAvailableSteps(),
		);
		expect(load).not.toHaveBeenCalled();
	});

	it("goTo with skipLifecycle does not load the target", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).not.toHaveBeenCalled();
	});
});
```

Note: `lazyDefinition(undefined as never)` produces a step with `load: undefined` (an ordinary eager step), used as the baseline.

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts`
Expected: FAIL — `isLoadingStep` undefined / `preloadStep is not a function`.

- [ ] **Step 3: Implement the plumbing**

All edits in `packages/core/src/machine/wizard-machine.ts`.

3a. Imports: add `WizardStepLoadError` to the `../errors` import list and add
```ts
import { loadStepDefinition } from "./lazy-steps";
```

3b. `WizardState<T>`: add after `progress`:
```ts
	/**
	 * WIZ-013: true while the implementation of the current step (or of the
	 * step being navigated to) is loading. Transient — never serialized.
	 */
	isLoadingStep: boolean;
```

3c. New private fields (after `guardRefreshSeq`):
```ts
	/** WIZ-013: in-flight lazy loads; concurrent requests share one promise. */
	private stepLoads = new Map<StepId, Promise<WizardStepDefinition<T>>>();
	/** WIZ-013: merged definitions of successfully loaded lazy steps. */
	private loadedSteps = new Map<StepId, WizardStepDefinition<T>>();
	/** WIZ-013: pending foreground loads of generation `foregroundLoadsGen`. */
	private foregroundLoads = 0;
	private foregroundLoadsGen = -1;
	/** WIZ-013: load errors already reported (each failed attempt reports once). */
	private reportedLoadErrors = new WeakSet<Error>();
```

3d. Every full `this.state = { … }` literal (constructor ~line 204, `restore()` ~line 465, `reset()` ~line 1538) gets `isLoadingStep: false,` (put it after `canGoBack`). Spread-based writes (`{ ...this.state, … }`) need no change.

3e. Replace the `currentStep` getter:
```ts
	/**
	 * Gets the current step definition. For a lazy step this is the skeleton
	 * until its implementation has loaded, then the merged definition (WIZ-013).
	 */
	get currentStep(): WizardStepDefinition<T> {
		return this.resolvedStep(this.state.currentStepId);
	}
```

3f. Add the public method (after `getAvailableSteps()`):
```ts
	/**
	 * WIZ-013: starts (or joins) loading a lazy step's implementation without
	 * navigating — e.g. on hover of the "Next" button. Never sets
	 * `isLoadingStep` and never reports through `onError`: a failure rejects
	 * the returned promise with `WizardStepLoadError` and the next attempt
	 * retries. Resolves immediately for steps without `load` or already loaded.
	 */
	async preloadStep(stepId: StepId): Promise<void> {
		if (!this.isKnownStepId(stepId)) {
			throw new WizardNavigationError(
				`Step "${stepId}" not found`,
				stepId,
				"not-found",
			);
		}
		if (!this.needsLoad(stepId)) {
			return;
		}
		await this.loadStep(stepId);
	}
```

3g. Add the private helpers (group them right before `notifyStateChange()`):
```ts
	/** WIZ-013: merged definition when loaded, the skeleton otherwise. */
	private resolvedStep(stepId: StepId): WizardStepDefinition<T> {
		return this.loadedSteps.get(stepId) ?? this.definition.steps[stepId];
	}

	/** WIZ-013: true when the step has a `load` that has not succeeded yet. */
	private needsLoad(stepId: StepId): boolean {
		return (
			this.definition.steps[stepId]?.load !== undefined &&
			!this.loadedSteps.has(stepId)
		);
	}

	/**
	 * WIZ-013: starts or joins the load of one step. A success is cached for
	 * the machine's lifetime (it survives reset/cancel/restore); a failure is
	 * evicted so the next request retries. Never touches state.
	 */
	private loadStep(stepId: StepId): Promise<WizardStepDefinition<T>> {
		const loaded = this.loadedSteps.get(stepId);
		if (loaded) {
			return Promise.resolve(loaded);
		}
		const inFlight = this.stepLoads.get(stepId);
		if (inFlight) {
			return inFlight;
		}
		const pending = loadStepDefinition(stepId, this.definition.steps[stepId]).then(
			(merged) => {
				this.loadedSteps.set(stepId, merged);
				return merged;
			},
		);
		this.stepLoads.set(stepId, pending);
		const settle = () => {
			if (this.stepLoads.get(stepId) === pending) {
				this.stepLoads.delete(stepId);
			}
		};
		pending.then(settle, settle);
		return pending;
	}

	/**
	 * WIZ-013: loads every not-yet-loaded step in `stepIds` as a FOREGROUND
	 * load (reflected in `isLoadingStep`). Callers must only await this when
	 * `stepIds.some((id) => this.needsLoad(id))`, so non-lazy wizards never get
	 * an extra microtask.
	 */
	private async ensureStepsLoaded(stepIds: StepId[]): Promise<void> {
		const pending = [...new Set(stepIds)].filter((id) => this.needsLoad(id));
		if (pending.length === 0) {
			return;
		}
		await this.trackForegroundLoad(
			Promise.all(pending.map((id) => this.loadStep(id))),
		);
	}

	/**
	 * WIZ-013: reference-counts foreground loads of the current generation.
	 * 0 → 1 sets `isLoadingStep: true`, 1 → 0 sets it back to false (one
	 * `onStateChange` each). Loads that started before a reset()/cancel()/
	 * restore() (which rebuild state with `isLoadingStep: false`) or that
	 * settle after destroy() never touch the flag.
	 */
	private async trackForegroundLoad<R>(work: Promise<R>): Promise<R> {
		const gen = this.generation;
		if (this.foregroundLoadsGen !== gen) {
			this.foregroundLoadsGen = gen;
			this.foregroundLoads = 0;
		}
		this.foregroundLoads += 1;
		if (this.foregroundLoads === 1) {
			this.setLoadingStep(true);
		}
		try {
			return await work;
		} finally {
			if (
				this.foregroundLoadsGen === gen &&
				this.generation === gen &&
				!this.isDestroyed
			) {
				this.foregroundLoads -= 1;
				if (this.foregroundLoads === 0) {
					this.setLoadingStep(false);
				}
			}
		}
	}

	private setLoadingStep(value: boolean): void {
		if (this.state.isLoadingStep === value) {
			return;
		}
		this.state = { ...this.state, isLoadingStep: value };
		this.notifyStateChange();
	}

	/**
	 * WIZ-013: reports a load failure with phase "load", at most once per
	 * error instance (all callers awaiting one failed attempt share it).
	 */
	private reportLoadError(error: unknown): void {
		if (error instanceof WizardStepLoadError) {
			if (this.reportedLoadErrors.has(error)) {
				return;
			}
			this.reportedLoadErrors.add(error);
			this.handleError(error, "load", error.stepId);
			return;
		}
		this.handleError(error, "load");
	}

	private isReportedLoadError(error: unknown): boolean {
		return error instanceof Error && this.reportedLoadErrors.has(error);
	}
```

- [ ] **Step 4: Run the new tests and the whole core suite**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts`
Expected: the "plumbing" tests PASS except "preloadStep never flips … later navigation reuses the load" may already pass too (navigation does not load yet, but the step was preloaded). All pass.

Run: `cd packages/core && npx vitest run`
Expected: the full core suite passes. If a test compares a whole snapshot with `toEqual({...})`, add `isLoadingStep: false` to its expected object.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/lazy-steps.test.ts
git commit -m "feat(core): lazy step cache, isLoadingStep and preloadStep (WIZ-013)"
```

---

## Task 5: Load on navigation (`navigateToStep`, `goNext`, `goTo`, `submit`) + single reporting

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`navigateToStep` ~1290, `goNext` ~902, `goTo` ~1088, `submit` ~830, `withTransition` ~2121)
- Test: `packages/core/tests/lazy-steps.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/lazy-steps.test.ts`:

```ts
describe("WIZ-013 lazy steps — navigation", () => {
	it("loads the target on first entry, runs the loaded onEnter, and flips isLoadingStep around the commit", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onStepEnter = vi.fn();
		const { machine, states } = createMachine(lazyDefinition(loader.load), {
			onStepEnter,
		});
		await flush();
		states.length = 0;

		const p = machine.goNext();
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(true);
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(machine.isBusy).toBe(true);

		loader.resolve();
		await p;

		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledWith("documents", initialData);
		expect(states).toEqual([
			{ currentStepId: "account", isLoadingStep: false }, // validate()
			{ currentStepId: "account", isLoadingStep: true },
			{ currentStepId: "account", isLoadingStep: false },
			{ currentStepId: "documents", isLoadingStep: false },
		]);
	});

	it("does not reload on repeated navigation (including after reset) and adds no emissions for loaded steps", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await machine.goNext();
		await machine.goPrevious();
		machine.reset();
		await flush();
		states.length = 0;

		await machine.goNext();
		expect(load).toHaveBeenCalledTimes(1);
		expect(states.every((s) => !s.isLoadingStep)).toBe(true);
	});

	it("target load failure: rejects with WizardStepLoadError, reports phase 'load' once, stays put, retry succeeds", async () => {
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("chunk failed"))
			.mockResolvedValue({});
		const onError = vi.fn();
		const pluginError = vi.fn();
		const beforeTransition = vi.fn(() => true);
		const accountLeave = vi.fn();
		const def = lazyDefinition(load);
		def.steps.account.onLeave = accountLeave;
		const { machine } = createMachine(def, { onError }, [
			{ name: "spy", onError: pluginError, beforeTransition },
		]);
		await flush();

		const error = await machine.goNext().catch((e) => e);
		expect(error).toBeInstanceOf(WizardStepLoadError);
		expect(error.stepId).toBe("documents");
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(error);
		expect(pluginError).toHaveBeenCalledTimes(1);
		expect(pluginError.mock.calls[0][1]).toMatchObject({
			phase: "load",
			stepId: "documents",
		});
		expect(beforeTransition).not.toHaveBeenCalled();
		expect(accountLeave).not.toHaveBeenCalled();
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(machine.snapshot.isLoadingStep).toBe(false);

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("loaded hooks override skeleton hooks; absent loaded hooks keep the skeleton's", async () => {
		const skeletonEnter = vi.fn();
		const loadedEnter = vi.fn();
		const skeletonValidate = vi.fn(() => ({ valid: true }));
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ onEnter: loadedEnter })), {
				onEnter: skeletonEnter,
				validate: skeletonValidate,
			}),
		);
		await machine.goNext();
		await machine.goNext();

		expect(loadedEnter).toHaveBeenCalledTimes(1);
		expect(skeletonEnter).not.toHaveBeenCalled();
		expect(skeletonValidate).toHaveBeenCalled();
	});

	it("accepts a module namespace with a default export", async () => {
		const onEnter = vi.fn();
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ default: { onEnter } }))),
		);
		await machine.goNext();
		expect(onEnter).toHaveBeenCalledTimes(1);
	});

	it("goPrevious from an unloaded lazy current step loads it to run its onLeave", async () => {
		const onLeave = vi.fn();
		const load = vi.fn(async () => ({ onLeave }));
		const { machine } = createMachine(lazyDefinition(load));
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		await machine.goPrevious();
		expect(load).toHaveBeenCalledTimes(1);
		expect(onLeave).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.currentStepId).toBe("account");
	});

	it("current-step load failure: goNext/goTo/submit reject with WizardStepLoadError, step not marked 'error'", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), { onError });
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });

		for (const run of [
			() => machine.goNext(),
			() => machine.goTo("account"),
			() => machine.submit(),
		]) {
			onError.mockClear();
			const error = await run().catch((e) => e);
			expect(error).toBeInstanceOf(WizardStepLoadError);
			expect(error).not.toBeInstanceOf(WizardValidationError);
			// once per operation (each operation is a fresh failed attempt)
			expect(onError).toHaveBeenCalledTimes(1);
			expect(machine.snapshot.stepStatuses.documents).not.toBe("error");
			expect(machine.snapshot.currentStepId).toBe("documents");
		}
	});

	it("submit() on a lazy last step runs the LOADED onSubmit", async () => {
		const onSubmit = vi.fn();
		const def = lazyDefinition(vi.fn(async () => ({})));
		def.steps.summary.load = vi.fn(async () => ({ onSubmit }));
		const { machine } = createMachine(def);
		await machine.goTo("summary", { skipValidation: true, skipLifecycle: true });

		await machine.submit();
		expect(onSubmit).toHaveBeenCalledTimes(1);
		expect(machine.snapshot.isCompleted).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts -t navigation`
Expected: FAIL — loaded `onEnter` not called, no `isLoadingStep` flips, failures reported with phase `"transition"`.

- [ ] **Step 3: Implement**

3a. Add a transition-scoped load helper next to the other WIZ-013 helpers:

```ts
	/**
	 * WIZ-013: loads `stepIds` inside a transition (withTransition / submit).
	 * Only call it when `stepIds.some((id) => this.needsLoad(id))`.
	 * Returns false when the transition was superseded or the machine was
	 * destroyed during the load — the caller must then return silently. A
	 * failure is reported once (phase "load") and rethrown, unless superseded.
	 */
	private async loadForTransition(stepIds: StepId[]): Promise<boolean> {
		try {
			await this.ensureStepsLoaded(stepIds);
		} catch (error) {
			if (this.isTransitionStale() || this.isDestroyed) {
				return false;
			}
			this.reportLoadError(error);
			throw error;
		}
		return !(this.isTransitionStale() || this.isDestroyed);
	}

	/** WIZ-013: loads the current step before validate()/onSubmit when needed. */
	private async loadCurrentForTransition(): Promise<boolean> {
		const currentId = this.state.currentStepId;
		if (!this.needsLoad(currentId)) {
			return true;
		}
		return this.loadForTransition([currentId]);
	}
```

3b. `navigateToStep()`: replace the two lines at the top

```ts
		const currentStep = this.currentStep;
		const targetStep = this.definition.steps[stepId];
```

with

```ts
		// WIZ-013: load the current (for onLeave) and target (for onEnter)
		// implementations BEFORE beforeTransition / onLeave / any state write, so
		// a failed load leaves the machine exactly where it was.
		if (!skipLifecycle) {
			const ids = [this.state.currentStepId, stepId];
			if (
				ids.some((id) => this.needsLoad(id)) &&
				!(await this.loadForTransition(ids))
			) {
				return;
			}
		}
		const currentStep = this.currentStep;
		const targetStep = this.resolvedStep(stepId);
```

(The later `targetStep.onEnter` call and the `onEnter`-throws path now use the merged definition automatically.)

3c. `goNext()`: insert right after the `isCompleted` check, before `const validationResult = await this.validate();`:

```ts
			// WIZ-013: a load failure is not a validation failure — load first.
			if (!(await this.loadCurrentForTransition())) {
				return;
			}
```

3d. `goTo()`: inside `if (!skipValidation) {`, before `const validationResult = await this.validate();`, insert the same three-line block.

3e. `submit()`:
- Delete `const step = this.currentStep;` (line ~844).
- Before `const validationResult = await this.validate();` insert the same `loadCurrentForTransition` block.
- Immediately before `// Execute step's submit handler`, add `const step = this.currentStep;` (re-read after the load).
- In the `catch`, change the condition to skip already-reported load errors:

```ts
			if (
				!(error instanceof WizardValidationError) &&
				!this.isReportedLoadError(error)
			) {
				this.handleError(error, "submit");
			}
```

3f. `withTransition()` catch: same change —

```ts
			if (
				!(error instanceof WizardValidationError) &&
				!this.isReportedLoadError(error)
			) {
				this.handleError(error);
			}
```

and update its comment: "A WizardValidationError (phase "validation") and an already-reported WizardStepLoadError (phase "load") are not re-reported here."

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts && npx vitest run`
Expected: all lazy tests so far PASS; full core suite PASS (non-lazy paths add no awaits).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/lazy-steps.test.ts
git commit -m "feat(core): load lazy steps on navigation and submit (WIZ-013)"
```

---

## Task 6: Initial step, `validate()`, `restore()`

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`initializeFirstStep` ~288, `validate` ~653)
- Test: `packages/core/tests/lazy-steps.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```ts
describe("WIZ-013 lazy steps — initial step, validate, restore", () => {
	function lazyInitialDefinition(load: StepLoader<Data>): WizardDefinition<Data> {
		return {
			id: "lazy-initial",
			initialStepId: "start",
			steps: {
				start: { id: "start", load, next: { type: "static", to: "end" } },
				optional: {
					id: "optional",
					enabled: () => false,
					next: { type: "static", to: "end" },
				},
				end: { id: "end" },
			},
		};
	}

	it("loads a lazy initial step, then runs its onEnter and onStepEnter", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onStepEnter = vi.fn();
		const { machine } = createMachine(lazyInitialDefinition(loader.load), {
			onStepEnter,
		});
		expect(machine.snapshot.isLoadingStep).toBe(true);

		loader.resolve();
		await flush();
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(onStepEnter).toHaveBeenCalledWith("start", initialData);
		expect(machine.snapshot.isLoadingStep).toBe(false);
	});

	it("initial load failure: reported, guard statuses still computed, onEnter not replayed after a successful retry", async () => {
		const onEnter = vi.fn();
		const validate = vi.fn(() => ({ valid: true }));
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({ onEnter, validate });
		const onError = vi.fn();
		const onStepEnter = vi.fn();
		const pluginError = vi.fn();
		const { machine } = createMachine(
			lazyInitialDefinition(load),
			{ onError, onStepEnter },
			[{ name: "spy", onError: pluginError }],
		);
		await flush();

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(WizardStepLoadError);
		expect(pluginError.mock.calls[0][1]).toMatchObject({ phase: "load" });
		expect(onStepEnter).not.toHaveBeenCalled();
		expect(machine.snapshot.stepStatuses.optional).toBe("skipped");

		await machine.validate();
		expect(load).toHaveBeenCalledTimes(2);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(onEnter).not.toHaveBeenCalled();

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("end");
	});

	it("restore() onto a lazy step starts the load; an explicit validate() joins it", async () => {
		const validate = vi.fn(() => ({ valid: false, errors: { passport: "bad" } }));
		const loader = controlledLoader({ validate });
		const { machine, states } = createMachine(lazyDefinition(loader.load));
		await flush();

		machine.restore(documentsSnapshot);
		expect(machine.snapshot.isLoadingStep).toBe(true);
		const result = machine.validate();
		await flush();
		expect(loader.load).toHaveBeenCalledTimes(1);

		loader.resolve();
		await expect(result).resolves.toEqual({
			valid: false,
			errors: { passport: "bad" },
		});
		await flush();
		expect(validate).toHaveBeenCalledTimes(2); // restore's validate + explicit
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect(states.some((s) => s.isLoadingStep)).toBe(true);
	});

	it("validate() with a failing load: invalid result, reported once, no state write, no onValidation", async () => {
		const load = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("down"));
		const onError = vi.fn();
		const onValidation = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), {
			onError,
			onValidation,
		});
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		const before = machine.snapshot;

		const result = await machine.validate();
		expect(result).toEqual({
			valid: false,
			errors: { general: "Failed to load step" },
		});
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onValidation).not.toHaveBeenCalled();
		expect(machine.snapshot.isValid).toBe(before.isValid);
		expect(machine.snapshot.validationErrors).toBe(before.validationErrors);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts -t "initial step"`
Expected: FAIL — initial `onEnter` from the loader never runs; `validate()` ignores the lazy validator.

- [ ] **Step 3: Implement**

3a. Replace `initializeFirstStep()` with:

```ts
	private async initializeFirstStep(): Promise<void> {
		// FIX 2: capture the generation so a stale re-enter from a superseded
		// reset()/cancel() does not fire onStepEnter/onStateChange.
		const gen = this.generation;
		const initialStepId = this.definition.initialStepId;

		// WIZ-013: load a lazy initial step first. On failure the error is
		// reported (phase "load") and onEnter/onStepEnter are skipped, but the
		// guard refresh + state notify below still run. The initial onEnter is
		// NOT replayed when a later validate()/navigation loads the step.
		let entered = true;
		if (this.needsLoad(initialStepId)) {
			try {
				await this.ensureStepsLoaded([initialStepId]);
			} catch (error) {
				if (this.generation !== gen || this.isDestroyed) {
					return;
				}
				this.reportLoadError(error);
				entered = false;
			}
			if (this.generation !== gen || this.isDestroyed) {
				return;
			}
		}

		try {
			if (entered) {
				const initialStep = this.resolvedStep(initialStepId);
				if (initialStep.onEnter) {
					await initialStep.onEnter(this.state.data, this.context);
				}
				if (this.generation !== gen) {
					return;
				}
				this.events.onStepEnter?.(initialStepId, this.state.data);
				this.debug(`Entered initial step: ${initialStepId}`);
			}
			// Recompute "skipped" for function `enabled` guards against the initial
			// data (constructor and reset re-entry). Folded into the notify below.
			let guardRefresh: { error: unknown } | undefined;
			if (this.hasFunctionGuards) {
				guardRefresh = await this.refreshGuardStatuses(
					() => this.generation !== gen,
				);
				if (this.generation !== gen) {
					return;
				}
			}
			// FIX 7: emit a state change after the awaited onEnter so async onEnter
			// side effects reach subscribers (harmless when there are none yet).
			this.notifyStateChange();
			if (guardRefresh) {
				this.handleError(guardRefresh.error, "transition");
			}
		} catch (error) {
			this.handleError(error, "lifecycle");
		}
	}
```

3b. `validate()`: insert right after `const gen = this.generation;` and BEFORE the existing `try {`:

```ts
		// WIZ-013: load a lazy current step before validating it. A failure is
		// reported once (phase "load") and yields an invalid result WITHOUT a
		// state write or onValidation — mirroring the thrown-validator path.
		const currentStepId = this.state.currentStepId;
		if (this.needsLoad(currentStepId)) {
			const loadFailed = {
				valid: false,
				errors: { general: "Failed to load step" },
			};
			try {
				await this.ensureStepsLoaded([currentStepId]);
			} catch (error) {
				if (this.generation !== gen || this.isDestroyed) {
					return loadFailed;
				}
				this.reportLoadError(error);
				this.validateAlreadyReported = true;
				return loadFailed;
			}
			if (this.generation !== gen || this.isDestroyed) {
				return { valid: false, errors: { general: "Validation error occurred" } };
			}
		}
```

(The existing `const step = this.currentStep;` inside the `try` already returns the merged definition.)

`restore()` needs no change: its trailing `void this.validate()` now performs the foreground load.

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts && npx vitest run`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/lazy-steps.test.ts
git commit -m "feat(core): load lazy initial step and current step in validate (WIZ-013)"
```

---

## Task 7: `validateAll()`

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`validateAll` ~721)
- Test: `packages/core/tests/lazy-steps.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```ts
describe("WIZ-013 lazy steps — validateAll", () => {
	it("loads enabled lazy steps, skips disabled ones, and reports load failures as _error without plugin dispatch", async () => {
		const documentsValidate = vi.fn(() => ({
			valid: false,
			errors: { passport: "required" },
		}));
		const disabledLoad = vi.fn(async () => ({}));
		const failingLoad = vi.fn<StepLoader<Data>>().mockRejectedValue(new Error("x"));
		const def = lazyDefinition(vi.fn(async () => ({ validate: documentsValidate })));
		def.steps.disabled = { id: "disabled", enabled: false, load: disabledLoad };
		def.steps.summary.load = failingLoad;
		const onError = vi.fn();
		const pluginError = vi.fn();
		const { machine, states } = createMachine(def, { onError }, [
			{ name: "spy", onError: pluginError },
		]);
		await flush();
		const before = states.length;

		const summary = await machine.validateAll();

		expect(disabledLoad).not.toHaveBeenCalled();
		expect(summary.steps.map((s) => s.stepId)).toEqual([
			"account",
			"documents",
			"summary",
		]);
		expect(summary.steps[1]).toMatchObject({
			valid: false,
			errors: { passport: "required" },
		});
		expect(summary.steps[2]).toMatchObject({
			valid: false,
			errors: { _error: 'Failed to load step "summary"' },
		});
		expect(summary.invalidStepIds).toEqual(["documents", "summary"]);
		expect(onError).not.toHaveBeenCalled();
		expect(pluginError).not.toHaveBeenCalled();
		expect(states.length).toBe(before); // no emission, no isLoadingStep flip
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts -t validateAll`
Expected: FAIL — lazy validator not used, `summary` reported valid.

- [ ] **Step 3: Implement**

Replace the `for (const [stepId, step] of Object.entries(this.definition.steps)) { … }` loop in `validateAll()` with:

```ts
		const entries = Object.entries(this.definition.steps);
		// WIZ-013: with unloaded lazy steps, evaluate all guards first, load the
		// enabled lazy steps in parallel, then validate in insertion order.
		// Without them the original per-step guard → validator order is kept.
		const hasUnloaded = entries.some(([stepId]) => this.needsLoad(stepId));
		const loadErrors = new Map<StepId, unknown>();
		let enabledIds: Set<StepId> | undefined;
		if (hasUnloaded) {
			enabledIds = new Set();
			for (const [stepId, step] of entries) {
				if (await evaluateGuard(step.enabled, this.state.data, this.context)) {
					enabledIds.add(stepId);
				}
			}
			const toLoad = [...enabledIds].filter((id) => this.needsLoad(id));
			// Background loads: no isLoadingStep flip, no onError (validateAll is
			// fully isolated from plugins).
			const settled = await Promise.allSettled(
				toLoad.map((id) => this.loadStep(id)),
			);
			settled.forEach((result, index) => {
				if (result.status === "rejected") {
					loadErrors.set(toLoad[index], result.reason);
				}
			});
		}

		// Insertion order == canonical order (matches computeProgress / Progress API).
		for (const [stepId, step] of entries) {
			if (enabledIds) {
				if (!enabledIds.has(stepId)) {
					continue;
				}
			} else {
				// Skip disabled steps (boolean false OR guard resolving to false).
				const isEnabled = await evaluateGuard(
					step.enabled,
					this.state.data,
					this.context,
				);
				if (!isEnabled) {
					continue;
				}
			}

			let result: ValidationResult;
			const loadError = loadErrors.get(stepId);
			if (loadErrors.has(stepId)) {
				const message =
					loadError instanceof Error ? loadError.message : String(loadError);
				result = { valid: false, errors: { _error: message } };
			} else {
				const validator = this.resolvedStep(stepId).validate || alwaysValid;
				try {
					result = await validator(this.state.data, this.context);
				} catch (error) {
					// A thrown validator is caught here and marked invalid with the
					// sentinel `_error` field. Do NOT call handleError / dispatch to
					// plugins — validateAll is fully isolated from the plugin system.
					const message =
						error instanceof Error ? error.message : String(error);
					result = { valid: false, errors: { _error: message } };
				}
			}

			steps.push({ stepId, valid: result.valid, errors: result.errors });
			if (!result.valid) {
				invalidStepIds.push(stepId);
			}
		}
```

Update the method's JSDoc with one line: "Lazy steps (WIZ-013) are loaded in the background (no `isLoadingStep`, no `onError`); a failed load marks that step invalid with `errors._error`."

- [ ] **Step 4: Run tests**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts tests/validate-all.test.ts && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/lazy-steps.test.ts
git commit -m "feat(core): load lazy steps in validateAll (WIZ-013)"
```

---

## Task 8: Supersede / destroy / dedupe behaviour

**Files:**
- Test: `packages/core/tests/lazy-steps.test.ts` (append)
- Modify: `packages/core/src/machine/wizard-machine.ts` only if a test fails

- [ ] **Step 1: Write the tests**

```ts
describe("WIZ-013 lazy steps — supersede, destroy, dedupe", () => {
	for (const [name, supersede] of [
		["reset()", (m: WizardMachine<Data>) => m.reset()],
		["cancel()", (m: WizardMachine<Data>) => void m.cancel()],
		["restore()", (m: WizardMachine<Data>) =>
			m.restore({ ...documentsSnapshot, currentStepId: "account", history: ["account"], visitedSteps: ["account"], stepStatuses: { account: "active", documents: "pristine", summary: "pristine" } })],
	] as const) {
		it(`${name} during a pending target load supersedes the transition`, async () => {
			const onEnter = vi.fn();
			const loader = controlledLoader({ onEnter });
			const onStepEnter = vi.fn();
			const onError = vi.fn();
			const { machine, states } = createMachine(lazyDefinition(loader.load), {
				onStepEnter,
				onError,
			});
			await flush();

			const p = machine.goNext();
			await flush();
			expect(machine.snapshot.isLoadingStep).toBe(true);
			supersede(machine);
			await flush();
			expect(machine.snapshot.isLoadingStep).toBe(false);
			const count = states.length;

			loader.resolve();
			await expect(p).resolves.toBeUndefined();
			await flush();
			expect(machine.snapshot.currentStepId).toBe("account");
			expect(onEnter).not.toHaveBeenCalled();
			expect(onStepEnter).not.toHaveBeenCalledWith("documents", expect.anything());
			expect(states.length).toBe(count);
			expect(onError).not.toHaveBeenCalled();
		});
	}

	it("a superseded load FAILURE is not reported", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(loader.load), { onError });
		await flush();

		const p = machine.goNext();
		await flush();
		machine.reset();
		loader.reject();
		await expect(p).resolves.toBeUndefined();
		expect(onError).not.toHaveBeenCalled();
	});

	it("destroy() during a pending load: no navigation, hooks, emissions or reports", async () => {
		const onEnter = vi.fn();
		const loader = controlledLoader({ onEnter });
		const onError = vi.fn();
		const { machine, states } = createMachine(lazyDefinition(loader.load), {
			onError,
		});
		await flush();

		const p = machine.goNext();
		await flush();
		await machine.destroy();
		const count = states.length;

		loader.resolve();
		await p;
		await flush();
		expect(machine.snapshot.currentStepId).toBe("account");
		expect(onEnter).not.toHaveBeenCalled();
		expect(states.length).toBe(count);
		expect(onError).not.toHaveBeenCalled();
	});

	it("concurrent validate() + goNext() on an unloaded current step share one load", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const loader = controlledLoader({ validate });
		const { machine } = createMachine(lazyDefinition(loader.load));
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });

		const v = machine.validate();
		const n = machine.goNext();
		await flush();
		expect(loader.load).toHaveBeenCalledTimes(1);

		loader.resolve();
		await Promise.all([v, n]);
		expect(machine.snapshot.currentStepId).toBe("summary");
	});

	it("a failed attempt awaited by two callers is reported once", async () => {
		const loader = controlledLoader();
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(loader.load), { onError });
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });

		const v = machine.validate();
		const n = machine.goNext().catch((e) => e);
		await flush();
		loader.reject();
		await v;
		const error = await n;
		expect(error).toBeInstanceOf(WizardStepLoadError);
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run**

Run: `cd packages/core && npx vitest run tests/lazy-steps.test.ts`
Expected: PASS with the Task 4–7 implementation. If a case fails, fix the guard in the code path it exercises (the stale/destroyed checks after each load await, or `trackForegroundLoad`'s generation/destroyed condition) — do not loosen the test.

Note on `cancel()`: it bumps the generation synchronously and resets after awaiting (no) handlers, so `isLoadingStep` is false after one `flush()`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/lazy-steps.test.ts packages/core/src/machine/wizard-machine.ts
git commit -m "test(core): lazy step supersede, destroy and dedupe coverage (WIZ-013)"
```

---

## Task 9: Repo-wide `WizardState` literal fix-ups + core verification

**Files:** whatever `typecheck` flags (hand-built `WizardState` objects in tests / fakes).

- [ ] **Step 1: Find hand-built state literals**

Run: `pnpm typecheck 2>&1 | grep -n "isLoadingStep" | head -50`
Expected: a list of `Property 'isLoadingStep' is missing…` errors (possibly none).

- [ ] **Step 2: Fix each one** by adding `isLoadingStep: false,` next to `canGoBack` in the literal. Do not make the field optional.

- [ ] **Step 3: Verify core**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-core && pnpm typecheck && pnpm lint:fix`
Expected: all green; `lint:fix` may reformat — re-run `git diff` to review.

- [ ] **Step 4: Commit**

```bash
git add -A packages
git commit -m "chore: add isLoadingStep to hand-built WizardState literals (WIZ-013)"
```

(Skip the commit if nothing changed.)

---

## Task 10: `wizard-state` — `isLoadingStep` slice, `TrackedLoadingFlag`, `preloadStep` action

**Files:**
- Modify: `packages/state/src/types.ts:44-48`
- Modify: `packages/state/src/manager.ts` (fields ~39, constructor ~94, `trackLoading` ~511, `setLoadingFlag` ~533, `discardLoadingRefs` ~543, `forceLoadingOff` ~556, `handleStateChange` ~693)
- Modify: `packages/state/src/actions.ts`
- Modify: `packages/state/src/index.ts` (export `TrackedLoadingFlag` type if `LoadingState` is exported there)
- Test: `packages/state/tests/lazy-loading.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `packages/state/tests/lazy-loading.test.ts`:

```ts
import {
	type StepLoader,
	type WizardDefinition,
	WizardMachine,
} from "@gooonzick/wizard-core";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createWizardActions } from "../src/actions";
import { WizardStateManager } from "../src/manager";

type Data = { name: string };
const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<V>() {
	let resolve!: (v: V) => void;
	const promise = new Promise<V>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function setup(initialLazy = false) {
	const gate = deferred<{ onEnter?: () => void }>();
	const load = vi.fn(() => gate.promise) as unknown as StepLoader<Data>;
	const definition: WizardDefinition<Data> = {
		id: "state-lazy",
		initialStepId: "a",
		steps: {
			a: {
				id: "a",
				next: { type: "static", to: "b" },
				...(initialLazy ? { load } : {}),
			},
			b: { id: "b", load: initialLazy ? undefined : load },
		},
	};
	let manager!: WizardStateManager<Data>;
	const machine = new WizardMachine<Data>(definition, {}, { name: "" }, {
		onStateChange: (s) => manager?.handleStateChange(s, manager.getSnapshot()),
	});
	manager = new WizardStateManager<Data>(machine, "a");
	return { machine, manager, gate, load };
}
```

> Before writing the remaining tests, open `packages/state/src/wiring.ts` and `packages/state/tests/wiring.test.ts` and copy how they connect `machine.onStateChange` to `manager` (the `previous`/`lastState` bookkeeping at `manager.ts:~680`). Prefer `createMachineAndManager({ definition, context: {}, initialData, getCallbacks: () => ({}) })` from `../src/wiring` over hand-wiring if it returns `{ machine, manager }` — it is the production path. Replace the hand-wired `setup()` above accordingly.

```ts
describe("WizardStateManager — isLoadingStep (WIZ-013)", () => {
	it("mirrors the machine flag and notifies the loading channel", async () => {
		const { machine, manager, gate } = setup();
		await flush();
		const onLoading = vi.fn();
		manager.subscribe(onLoading, "loading");

		const p = machine.goNext();
		await flush();
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
		expect(onLoading).toHaveBeenCalled();

		gate.resolve({});
		await p;
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(false);
	});

	it("is seeded from the snapshot when the initial step is lazy", () => {
		const { manager } = setup(true);
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
	});

	it("refreshes currentStep in the state slice when a step finishes loading in place", async () => {
		const { manager, gate } = setup(true);
		const onEnter = vi.fn();
		const skeleton = manager.getStateSnapshot().currentStep;
		gate.resolve({ onEnter });
		await flush();
		expect(manager.getStateSnapshot().currentStep).not.toBe(skeleton);
		expect(manager.getStateSnapshot().currentStep.onEnter).toBe(onEnter);
	});

	it("is untouched by trackLoading and forceLoadingOff paths", async () => {
		const { machine, manager } = setup();
		await flush();
		void machine.goNext();
		await flush();
		await manager.trackLoading("isValidating", async () => {});
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(true);
	});

	it("trackLoading does not accept isLoadingStep", () => {
		type Flag = Parameters<WizardStateManager<Data>["trackLoading"]>[0];
		expectTypeOf<"isLoadingStep">().not.toMatchTypeOf<Flag>();
	});

	it("actions.preloadStep delegates to the machine without loading flags", async () => {
		const { manager, gate, load } = setup();
		await flush();
		const actions = createWizardActions(manager, () => {});
		const p = actions.preloadStep("b");
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
		expect(manager.getLoadingSnapshot().isLoadingStep).toBe(false);
		gate.resolve({});
		await p;
		expect(load).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/state && npx vitest run tests/lazy-loading.test.ts`
Expected: FAIL — `isLoadingStep` undefined in the loading snapshot; `preloadStep` missing.

- [ ] **Step 3: Implement**

`packages/state/src/types.ts` — extend `LoadingState` and add the tracked-flag type:

```ts
export interface LoadingState {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
	/**
	 * WIZ-013: a lazy step implementation is loading. Mirrors
	 * `machine.snapshot.isLoadingStep` (owned by the machine, not by
	 * `trackLoading()`).
	 */
	isLoadingStep: boolean;
}

/** Loading flags owned by the manager's reference-counted `trackLoading()`. */
export type TrackedLoadingFlag = Exclude<keyof LoadingState, "isLoadingStep">;
```

Update the `LoadingState` doc comment ("UI concerns managed by state manager, not core machine") to: "Loading flags. `isValidating` / `isSubmitting` / `isNavigating` are UI flags owned by the manager; `isLoadingStep` mirrors the machine."

`packages/state/src/manager.ts`:
- import `TrackedLoadingFlag` from `./types`;
- `loadingCounts: Record<TrackedLoadingFlag, number>`; `trackLoading(flag: TrackedLoadingFlag, …)`; `setLoadingFlag(flag: TrackedLoadingFlag, …)`;
- constructor: move the `loadingCache` initialisation **after** `const snapshot = this.machine.snapshot;` and seed it:

```ts
		// Loading flags: the three UI flags start off; isLoadingStep mirrors the
		// machine, which may already be loading a lazy initial step (WIZ-013).
		this.loadingCache = {
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
			isLoadingStep: snapshot.isLoadingStep,
		};
```

- `forceLoadingOff()`: leave `isLoadingStep` out of the object passed to `setLoadingState` (it is a partial update, so the field is preserved) — no change needed beyond confirming that.
- `handleStateChange()`: before `if (affected.length > 0) {` insert

```ts
		// WIZ-013: isLoadingStep is owned by the machine. Mirror it into the
		// loading cache; when a lazy step finished loading in place (initial
		// step, after restore()) machine.currentStep changed identity, so the
		// state slice must pick up the merged definition too.
		if (newState.isLoadingStep !== oldState.isLoadingStep) {
			this.loadingCache = {
				...this.loadingCache,
				isLoadingStep: newState.isLoadingStep,
			};
			affected.push("loading");
			if (this.machine.currentStep !== this.stateCache.currentStep) {
				affected.push("state");
			}
		}
```

`packages/state/src/actions.ts`:
- add to `WizardBindingActions<T>`:

```ts
	/** WIZ-013: prefetch a lazy step's implementation (no loading flag). */
	preloadStep: (stepId: StepId) => Promise<void>;
```

- add to the returned object (after `goToStep`):

```ts
		preloadStep: (stepId) => machine.preloadStep(stepId),
```

`packages/state/src/index.ts`: export `type TrackedLoadingFlag` next to `LoadingState`.

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-state && pnpm --filter @gooonzick/wizard-state typecheck`
Expected: PASS. Existing tests that build `LoadingState` literals or expect `getLoadingSnapshot()` `toEqual({ isValidating, isSubmitting, isNavigating })` need `isLoadingStep: false` added.

- [ ] **Step 5: Commit**

```bash
git add packages/state
git commit -m "feat(state): mirror isLoadingStep and add preloadStep action (WIZ-013)"
```

---

## Task 11: React binding

**Files:**
- Modify: `packages/react/src/use-wizard.tsx` (`UseWizardLoading` ~127, `UseWizardActions` ~160, `pickDataActions` ~211, `loadingSlice` ~432)
- Modify: `packages/react/src/use-wizard-granular.tsx` (`useWizardLoading` ~144)
- Test: `packages/react/tests/lazy-steps.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";

type D = { name: string };

describe("useWizard — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep while a lazy step loads, and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<{ onEnter?: () => void }>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "react-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		const { result } = renderHook(() =>
			useWizard({ definition, initialData: { name: "" } }),
		);
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(typeof result.current.actions.preloadStep).toBe("function");

		let nav!: Promise<void>;
		act(() => {
			nav = result.current.navigation.goNext();
		});
		await waitFor(() => expect(result.current.loading.isLoadingStep).toBe(true));

		await act(async () => {
			release();
			await nav;
		});
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(result.current.state.currentStepId).toBe("b");
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/react && npx vitest run tests/lazy-steps.test.tsx`
Expected: FAIL — `isLoadingStep` undefined.

- [ ] **Step 3: Implement**

- `UseWizardLoading`: add `isLoadingStep: boolean;` with a one-line JSDoc ("A lazy step implementation is loading (WIZ-013).").
- `UseWizardActions<T>`: add `preloadStep: (stepId: StepId) => Promise<void>;` (import `StepId` type if needed).
- `pickDataActions`: add `preloadStep: actions.preloadStep,`.
- `loadingSlice` in `useWizard` and the object returned by `useWizardLoading`: add `isLoadingStep: loadingSnapshot.isLoadingStep,` and add `loadingSnapshot.isLoadingStep` to both `useMemo` dependency arrays.
- Update the `useWizardLoading` JSDoc example to `const { isValidating, isSubmitting, isNavigating, isLoadingStep } = useWizardLoading();`.

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-react && pnpm --filter @gooonzick/wizard-react typecheck`
Expected: PASS (fix any existing `toEqual` on the loading slice by adding `isLoadingStep: false`).

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): expose isLoadingStep and preloadStep (WIZ-013)"
```

---

## Task 12: Vue binding

**Files:**
- Modify: `packages/vue/src/types.ts` (`UseWizardLoading` ~128, `UseWizardActions` ~168)
- Modify: `packages/vue/src/use-wizard.ts` (`loadingSlice` ~165, `actionsSlice` ~171)
- Modify: `packages/vue/src/use-wizard-granular.ts` (JSDoc example ~78)
- Test: `packages/vue/tests/lazy-steps.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

type D = { name: string };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useWizard (vue) — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep while a lazy step loads, and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<object>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "vue-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		let wizard!: UseWizardReturn<D>;
		mount(
			defineComponent({
				setup() {
					wizard = useWizard({ definition, initialData: { name: "" } });
					return {};
				},
				template: "<div></div>",
			}),
		);
		expect(wizard.loading.isLoadingStep.value).toBe(false);
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.navigation.goNext();
		await flush();
		expect(wizard.loading.isLoadingStep.value).toBe(true);

		release();
		await nav;
		expect(wizard.loading.isLoadingStep.value).toBe(false);
		expect(wizard.state.currentStepId.value).toBe("b");
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/vue && npx vitest run tests/lazy-steps.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `types.ts` `UseWizardLoading`: add `isLoadingStep: ComputedRef<boolean>;`; `UseWizardActions<T>`: add `preloadStep: (stepId: StepId) => Promise<void>;`.
- `use-wizard.ts`: `loadingSlice` add `isLoadingStep: computed(() => loading.value.isLoadingStep),`; `actionsSlice` add `preloadStep: actions.preloadStep,`.
- `use-wizard-granular.ts`: JSDoc example adds `isLoadingStep`.

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-vue && pnpm --filter @gooonzick/wizard-vue typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vue
git commit -m "feat(vue): expose isLoadingStep and preloadStep (WIZ-013)"
```

---

## Task 13: Svelte binding (stores + runes)

**Files:**
- Modify: `packages/svelte/src/types.ts` (`WizardStoreLoading` ~91, `WizardStoreActions` ~133)
- Modify: `packages/svelte/src/runes/types.ts` (`WizardStoreLoading` ~96, flat `readonly isNavigating` ~158; if it re-declares actions, add `preloadStep` there too)
- Modify: `packages/svelte/src/runes/create-wizard.svelte.ts` (flat getters ~168)
- Test: `packages/svelte/tests/lazy-steps.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { createWizardStore } from "../src/create-wizard-store";
import { createWizard } from "../src/runes/create-wizard.svelte";
import { flush } from "./helpers/flush";

type D = { name: string };

function lazyDefinition() {
	let release!: () => void;
	const load = vi.fn(
		() =>
			new Promise<object>((resolve) => {
				release = () => resolve({});
			}),
	) as unknown as StepLoader<D>;
	const definition: WizardDefinition<D> = {
		id: "svelte-lazy",
		initialStepId: "a",
		steps: {
			a: { id: "a", next: { type: "static", to: "b" } },
			b: { id: "b", load },
		},
	};
	return { definition, release: () => release() };
}

describe("svelte — lazy steps (WIZ-013)", () => {
	it("store API: loading.isLoadingStep and $wizard.isLoadingStep", async () => {
		const { definition, release } = lazyDefinition();
		const wizard = createWizardStore<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(get(wizard.loading).isLoadingStep).toBe(true);
		expect(get(wizard).isLoadingStep).toBe(true);

		release();
		await nav;
		expect(get(wizard.loading).isLoadingStep).toBe(false);
	});

	it("runes API: flat isLoadingStep getter", async () => {
		const { definition, release } = lazyDefinition();
		const wizard = createWizard<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(wizard.isLoadingStep).toBe(true);

		release();
		await nav;
		expect(wizard.isLoadingStep).toBe(false);
		expect(wizard.currentStepId).toBe("b");
	});
});
```

(If the existing runes tests wrap `createWizard` in `$effect.root` or a component, follow `packages/svelte/tests/runes/create-wizard.test.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/svelte && npx vitest run tests/lazy-steps.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `types.ts` `WizardStoreLoading`: add `isLoadingStep: boolean;` (the flat `WizardSnapshot` extends it, so `$wizard.isLoadingStep` follows). `WizardStoreActions<T>`: add `preloadStep: (stepId: StepId) => Promise<void>;` with a WIZ-013 JSDoc line. Store and runes `actions` already come from the rest-spread of `createWizardActions`, so no runtime change there.
- `runes/types.ts`: same addition to its `WizardStoreLoading` (if separate), and `readonly isLoadingStep: boolean;` after `readonly isNavigating: boolean;`.
- `runes/create-wizard.svelte.ts`: after the `isNavigating` getter add

```ts
		get isLoadingStep() {
			return loadingSnapshot.isLoadingStep;
		},
```

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-svelte && pnpm --filter @gooonzick/wizard-svelte typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/svelte
git commit -m "feat(svelte): expose isLoadingStep and preloadStep (WIZ-013)"
```

---

## Task 14: Solid binding

**Files:**
- Modify: `packages/solid/src/types.ts` (flat `readonly isNavigating` ~136, `WizardStoreActions` ~82)
- Modify: `packages/solid/src/create-wizard.ts` (`actions` object ~106, flat getters ~208)
- Test: `packages/solid/tests/lazy-steps.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import { flush } from "./helpers/flush";

type D = { name: string };

describe("solid — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep (flat + loading slice) and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<object>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "solid-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		const wizard = createWizard<D>({ definition, initialData: { name: "" } });
		expect(typeof wizard.actions.preloadStep).toBe("function");

		const nav = wizard.goNext();
		await flush();
		expect(wizard.isLoadingStep).toBe(true);
		expect(wizard.loading.isLoadingStep).toBe(true);

		release();
		await nav;
		expect(wizard.isLoadingStep).toBe(false);
		expect(wizard.currentStepId).toBe("b");
		await wizard.destroy();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/solid && npx vitest run tests/lazy-steps.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `types.ts`: `readonly isLoadingStep: boolean;` after `readonly isNavigating: boolean;`; `WizardStoreActions<T>`: add `preloadStep: (stepId: StepId) => Promise<void>;`. (`WizardStoreLoading = LoadingState` picks up `isLoadingStep` automatically.)
- `create-wizard.ts`: in the explicit `actions` object add `preloadStep: bindingActions.preloadStep,`; after the `isNavigating` getter add

```ts
		get isLoadingStep() {
			return loadingSnapshot().isLoadingStep;
		},
```

- [ ] **Step 4: Run tests**

Run: `pnpm turbo run test --filter=@gooonzick/wizard-solid && pnpm --filter @gooonzick/wizard-solid typecheck`
Expected: PASS.

- [ ] **Step 5: Commit + full verification**

```bash
git add packages/solid
git commit -m "feat(solid): expose isLoadingStep and preloadStep (WIZ-013)"
pnpm test && pnpm typecheck && pnpm lint:fix && pnpm build
```

Expected: everything green. Commit any `lint:fix` formatting as `style: biome format (WIZ-013)`.

---

## Task 15: Shared demo modules (copied into each example app)

Each app gets its own copy (same pattern as WIZ-015, where `src/wizard/*` was copied per app) of three files under `src/lazy-steps/`.

**Files (create, identical content in each app):**
- `examples/react-examples/src/lazy-steps/{types,definition,documents-step}.ts`
- `examples/vue-examples/src/lazy-steps/{types,definition,documents-step}.ts`
- `examples/svelte-examples/src/lazy-steps/{types,definition,documents-step}.ts`
- `examples/solid-examples/src/lazy-steps/{types,definition,documents-step}.ts`

- [ ] **Step 1: Create `types.ts`**

```ts
export type LazyDemoData = {
	email: string;
	passport: string;
};

export const lazyInitialData: LazyDemoData = {
	email: "",
	passport: "",
};
```

- [ ] **Step 2: Create `documents-step.ts`**

```ts
import type { LazyStepImplementation } from "@gooonzick/wizard-core";
import type { LazyDemoData } from "./types";

/**
 * Loaded on first use through `.lazy()` — Vite emits this module as its own
 * chunk (watch the Network tab). In a real app a heavy Zod/Valibot schema
 * would live here.
 */
export const documentsStep: LazyStepImplementation<LazyDemoData> = {
	validate: (data) =>
		/^[A-Z]{2}\d{7}$/.test(data.passport)
			? { valid: true }
			: {
					valid: false,
					errors: { passport: "Passport number must look like AB1234567" },
				},
	onEnter: () => {
		console.info("[lazy-steps] documents implementation loaded and entered");
	},
};
```

- [ ] **Step 3: Create `definition.ts`**

```ts
import {
	createWizard,
	type LazyStepImplementation,
} from "@gooonzick/wizard-core";
import type { LazyDemoData } from "./types";

let failNextLoad = false;

/** Demo switch: makes the next documents-step load reject once. */
export function armLoadFailure(): void {
	failNextLoad = true;
}

async function loadDocumentsStep(): Promise<
	LazyStepImplementation<LazyDemoData>
> {
	// Artificial latency so the loading state is visible in the demo.
	await new Promise((resolve) => setTimeout(resolve, 800));
	if (failNextLoad) {
		failNextLoad = false;
		throw new Error("Simulated chunk load failure");
	}
	const module = await import("./documents-step");
	return module.documentsStep;
}

export function createLazyStepsWizard() {
	return createWizard<LazyDemoData>("lazy-steps")
		.initialStep("account")
		.step("account", (s) =>
			s
				.title("Account")
				.description("An ordinary eager step.")
				.required("email")
				.next("documents"),
		)
		.step("documents", (s) =>
			s
				.title("Documents")
				.description(
					"validate + onEnter come from a separate chunk, loaded on first entry.",
				)
				.previous("account")
				.next("summary")
				.lazy(loadDocumentsStep),
		)
		.step("summary", (s) => s.title("Summary").previous("documents"))
		.build();
}
```

- [ ] **Step 4: Typecheck one app to validate the shared modules**

Run: `pnpm --filter @gooonzick/wizard-react-example typecheck` (check the exact package name in `examples/react-examples/package.json`).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/*/src/lazy-steps
git commit -m "docs(examples): shared lazy-steps demo modules (WIZ-013)"
```

---

## Task 16: React example

**Files:**
- Create: `examples/react-examples/src/lazy-steps-example.tsx`
- Modify: `examples/react-examples/src/App.tsx` (`View` union, `tabs`, render switch)

- [ ] **Step 1: Create the component**

```tsx
import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
import { lazyInitialData } from "./lazy-steps/types";

const definition = createLazyStepsWizard();

function LazyStepsWizard({ onRecreate }: { onRecreate: () => void }) {
	const [loadError, setLoadError] = useState<string | null>(null);
	const [failureArmed, setFailureArmed] = useState(false);
	const { state, navigation, validation, loading, actions } = useWizard({
		definition,
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				const cause = error.cause instanceof Error ? error.cause.message : "";
				setLoadError(`${error.message}${cause ? ` — ${cause}` : ""}`);
				setFailureArmed(false);
			}
		},
		onStepEnter: () => setLoadError(null),
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const step = state.currentStep;
	const next = () => {
		setLoadError(null);
		void navigation.goNext().catch(() => {});
	};

	return (
		<Card className="p-8 space-y-4">
			<div>
				<h2 className="text-xl font-semibold">{step.meta?.title}</h2>
				<p className="text-sm text-gray-500">{step.meta?.description}</p>
			</div>

			{loading.isLoadingStep && (
				<p className="text-sm text-blue-600 animate-pulse">
					Loading step implementation…
				</p>
			)}
			{loadError && <p className="text-sm text-red-600">{loadError}</p>}

			{state.currentStepId === "account" && (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">Email</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={state.data.email}
						onChange={(e) => actions.updateField("email", e.target.value)}
						placeholder="ada@example.com"
					/>
				</label>
			)}
			{state.currentStepId === "documents" && (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">
						Passport number
					</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={state.data.passport}
						onChange={(e) => actions.updateField("passport", e.target.value)}
						placeholder="AB1234567"
					/>
				</label>
			)}
			{state.currentStepId === "summary" && (
				<pre className="rounded bg-gray-100 p-3 text-xs">
					{JSON.stringify(state.data, null, 2)}
				</pre>
			)}

			{validation.validationErrors &&
				Object.entries(validation.validationErrors).map(([field, msg]) => (
					<p key={field} className="text-sm text-red-600">
						{msg}
					</p>
				))}

			<div className="flex flex-wrap gap-3">
				<Button
					variant="outline"
					onClick={() => void navigation.goPrevious().catch(() => {})}
					disabled={!navigation.canGoPrevious || loading.isNavigating}
				>
					Back
				</Button>
				{navigation.isLastStep ? (
					<Button onClick={() => void actions.submit().catch(() => {})}>
						Finish
					</Button>
				) : (
					<Button
						onClick={next}
						// Prefetch the lazy step while the user is about to click.
						onMouseEnter={() =>
							state.currentStepId === "account" &&
							void actions.preloadStep("documents").catch(() => {})
						}
						disabled={loading.isNavigating}
					>
						{loading.isLoadingStep ? "Loading…" : "Next"}
					</Button>
				)}
			</div>

			<div className="flex flex-wrap gap-3 border-t pt-4 text-sm">
				<Button
					variant="outline"
					onClick={() => {
						armLoadFailure();
						setFailureArmed(true);
					}}
				>
					{failureArmed ? "Next load will fail" : "Fail next load"}
				</Button>
				<Button variant="outline" onClick={onRecreate}>
					Recreate wizard (forget loaded chunks)
				</Button>
			</div>
			<p className="text-xs text-gray-500">
				A loaded step is cached per wizard. Hovering “Next” on the first step
				prefetches it with <code>preloadStep</code>, so no spinner appears.
				“Fail next load” only matters before the step has loaded once —
				recreate the wizard to try it again.
			</p>
		</Card>
	);
}

export const LazyStepsExample: React.FC = () => {
	const [generation, setGeneration] = useState(0);
	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-3xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900">Lazy Steps</h1>
				<p className="text-gray-600 mt-1 mb-6">
					The Documents step loads its validation and lifecycle code on demand
					(WIZ-013).
				</p>
				<LazyStepsWizard
					key={generation}
					onRecreate={() => setGeneration((g) => g + 1)}
				/>
			</div>
		</div>
	);
};
```

Before saving, open `examples/react-examples/src/components/ui/button.tsx` and confirm the `variant` prop accepts `"outline"` and the button forwards `onMouseEnter` (spread props). Adjust if not.

- [ ] **Step 2: Wire the tab** in `App.tsx`: add `| "lazy-steps"` to `View`, `{ id: "lazy-steps", label: "Lazy Steps" }` to `tabs`, `import { LazyStepsExample } from "./lazy-steps-example";`, and `{view === "lazy-steps" && <LazyStepsExample />}`.

- [ ] **Step 3: Verify**

Run: `pnpm --filter <react example package> typecheck && pnpm --filter <react example package> build`
Expected: PASS; build output lists a separate `documents-step-*.js` chunk.

Then use the `run` skill (or `pnpm --filter <pkg> dev` via preview tooling) to open the app, click "Lazy Steps", and check: spinner on first Next, no spinner after hover-prefetch, "Fail next load" shows the error and the next click succeeds.

- [ ] **Step 4: Commit**

```bash
git add examples/react-examples
git commit -m "docs(examples): React lazy steps demo (WIZ-013)"
```

---

## Task 17: Vue example

**Files:**
- Create: `examples/vue-examples/src/wizard-example/lazy-steps-example.vue`
- Create: `examples/vue-examples/src/wizard-example/lazy-steps-wizard.vue`
- Modify: `examples/vue-examples/src/App.vue` (`Approach`, `approaches`, render chain)
- Modify: `examples/vue-examples/src/components/approach-toggle.vue` (`Approach` union + a button)

- [ ] **Step 1: Create `lazy-steps-wizard.vue`**

```vue
<script setup lang="ts">
import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import {
	armLoadFailure,
	createLazyStepsWizard,
} from "../lazy-steps/definition";
import { lazyInitialData } from "../lazy-steps/types";

const emit = defineEmits<(event: "recreate") => void>();

const loadError = ref<string | null>(null);
const failureArmed = ref(false);

const { state, navigation, validation, loading, actions } = useWizard({
	definition: createLazyStepsWizard(),
	initialData: lazyInitialData,
	onError: (error) => {
		if (error instanceof WizardStepLoadError) {
			const cause = error.cause instanceof Error ? error.cause.message : "";
			loadError.value = `${error.message}${cause ? ` — ${cause}` : ""}`;
			failureArmed.value = false;
		}
	},
	onStepEnter: () => {
		loadError.value = null;
	},
	onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
});

function next() {
	loadError.value = null;
	void navigation.goNext().catch(() => {});
}

function prefetch() {
	if (state.currentStepId.value === "account") {
		void actions.preloadStep("documents").catch(() => {});
	}
}

function armFailure() {
	armLoadFailure();
	failureArmed.value = true;
}
</script>

<template>
	<Card class="p-8 space-y-4">
		<div>
			<h2 class="text-xl font-semibold">{{ state.currentStep.value.meta?.title }}</h2>
			<p class="text-sm text-gray-500">
				{{ state.currentStep.value.meta?.description }}
			</p>
		</div>

		<p v-if="loading.isLoadingStep.value" class="text-sm text-blue-600 animate-pulse">
			Loading step implementation…
		</p>
		<p v-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>

		<label v-if="state.currentStepId.value === 'account'" class="block">
			<span class="text-sm font-medium text-gray-700">Email</span>
			<input
				:value="state.data.value.email"
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
				placeholder="ada@example.com"
				@input="actions.updateField('email', ($event.target as HTMLInputElement).value)"
			/>
		</label>
		<label v-else-if="state.currentStepId.value === 'documents'" class="block">
			<span class="text-sm font-medium text-gray-700">Passport number</span>
			<input
				:value="state.data.value.passport"
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
				placeholder="AB1234567"
				@input="actions.updateField('passport', ($event.target as HTMLInputElement).value)"
			/>
		</label>
		<pre v-else class="rounded bg-gray-100 p-3 text-xs">{{ JSON.stringify(state.data.value, null, 2) }}</pre>

		<p
			v-for="(msg, field) in validation.validationErrors.value"
			:key="field"
			class="text-sm text-red-600"
		>
			{{ msg }}
		</p>

		<div class="flex flex-wrap gap-3">
			<Button
				variant="outline"
				:disabled="!navigation.canGoPrevious.value || loading.isNavigating.value"
				@click="navigation.goPrevious().catch(() => {})"
			>
				Back
			</Button>
			<Button
				v-if="navigation.isLastStep.value"
				@click="actions.submit().catch(() => {})"
			>
				Finish
			</Button>
			<Button
				v-else
				:disabled="loading.isNavigating.value"
				@click="next"
				@mouseenter="prefetch"
			>
				{{ loading.isLoadingStep.value ? "Loading…" : "Next" }}
			</Button>
		</div>

		<div class="flex flex-wrap gap-3 border-t pt-4 text-sm">
			<Button variant="outline" @click="armFailure">
				{{ failureArmed ? "Next load will fail" : "Fail next load" }}
			</Button>
			<Button variant="outline" @click="emit('recreate')">
				Recreate wizard (forget loaded chunks)
			</Button>
		</div>
		<p class="text-xs text-gray-500">
			A loaded step is cached per wizard. Hovering “Next” on the first step
			prefetches it with <code>preloadStep</code>, so no spinner appears.
			“Fail next load” only matters before the step has loaded once — recreate
			the wizard to try it again.
		</p>
	</Card>
</template>
```

Check the property names on Vue's slices against `packages/vue/src/types.ts` (e.g. `navigation.canGoPrevious` vs `canGoBack`, `navigation.isLastStep`) and the `Button` component's `variant` prop; also confirm `@mouseenter` reaches the root element of `ui/button.vue` (attribute fallthrough).

- [ ] **Step 2: Create `lazy-steps-example.vue`**

```vue
<script setup lang="ts">
import { ref } from "vue";
import LazyStepsWizard from "./lazy-steps-wizard.vue";

const generation = ref(0);
</script>

<template>
	<div class="py-2">
		<h1 class="text-3xl font-bold text-gray-900">Lazy Steps</h1>
		<p class="text-gray-600 mt-1 mb-6">
			The Documents step loads its validation and lifecycle code on demand
			(WIZ-013).
		</p>
		<LazyStepsWizard :key="generation" @recreate="generation++" />
	</div>
</template>
```

- [ ] **Step 3: Wire it** — in `approach-toggle.vue` add `| "lazy-steps"` to `Approach` and a button:

```vue
		<Button
			:variant="modelValue === 'lazy-steps' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'lazy-steps')"
		>
			Lazy Steps
		</Button>
```

In `App.vue` add `| "lazy-steps"` to `Approach`, `"lazy-steps"` to `approaches`, `import LazyStepsExample from "./wizard-example/lazy-steps-example.vue";`, and `<LazyStepsExample v-else-if="approach === 'lazy-steps'" />` after the data-change line.

- [ ] **Step 4: Verify** — `pnpm --filter <vue example package> typecheck && pnpm --filter <vue example package> build` (package name from `examples/vue-examples/package.json`); then open the app and click through as in Task 16.

- [ ] **Step 5: Commit**

```bash
git add examples/vue-examples
git commit -m "docs(examples): Vue lazy steps demo (WIZ-013)"
```

---

## Task 18: Svelte example (runes API)

**Files:**
- Create: `examples/svelte-examples/src/LazyStepsExample.svelte`
- Create: `examples/svelte-examples/src/LazyStepsWizard.svelte`
- Modify: `examples/svelte-examples/src/App.svelte` (`Tab`, `TABS`, render chain)

- [ ] **Step 1: Create `LazyStepsWizard.svelte`**

```svelte
<script lang="ts">
	import { WizardStepLoadError } from "@gooonzick/wizard-core";
	import { createWizard } from "@gooonzick/wizard-svelte/runes";
	import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
	import { type LazyDemoData, lazyInitialData } from "./lazy-steps/types";

	let { onRecreate }: { onRecreate: () => void } = $props();

	let loadError = $state<string | null>(null);
	let failureArmed = $state(false);

	const wizard = createWizard<LazyDemoData>({
		definition: createLazyStepsWizard(),
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				const cause = error.cause instanceof Error ? error.cause.message : "";
				loadError = `${error.message}${cause ? ` — ${cause}` : ""}`;
				failureArmed = false;
			}
		},
		onStepEnter: () => {
			loadError = null;
		},
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const email = wizard.field("email");
	const passport = wizard.field("passport");

	function next() {
		loadError = null;
		void wizard.goNext().catch(() => {});
	}

	function prefetch() {
		if (wizard.currentStepId === "account") {
			void wizard.actions.preloadStep("documents").catch(() => {});
		}
	}
</script>

<section class="panel">
	<h2>{wizard.currentStep.meta?.title}</h2>
	<p class="description">{wizard.currentStep.meta?.description}</p>

	{#if wizard.isLoadingStep}
		<p class="description">Loading step implementation…</p>
	{/if}
	{#if loadError}
		<p class="error">{loadError}</p>
	{/if}

	{#if wizard.currentStepId === "account"}
		<label>
			<span>Email</span>
			<input bind:value={email.value} placeholder="ada@example.com" />
		</label>
	{:else if wizard.currentStepId === "documents"}
		<label>
			<span>Passport number</span>
			<input bind:value={passport.value} placeholder="AB1234567" />
		</label>
	{:else}
		<pre class="debug">{JSON.stringify(wizard.data, null, 2)}</pre>
	{/if}

	{#each Object.entries(wizard.validationErrors ?? {}) as [field, message] (field)}
		<p class="error">{message}</p>
	{/each}

	<div class="controls">
		<button
			class="secondary"
			onclick={() => wizard.goPrevious().catch(() => {})}
			disabled={!wizard.canGoPrevious || wizard.isNavigating}
		>
			Back
		</button>
		{#if wizard.isLastStep}
			<button onclick={() => wizard.actions.submit().catch(() => {})}>Finish</button>
		{:else}
			<button onclick={next} onmouseenter={prefetch} disabled={wizard.isNavigating}>
				{wizard.isLoadingStep ? "Loading…" : "Next"}
			</button>
		{/if}
		<span class="spacer"></span>
		<button
			class="secondary"
			onclick={() => {
				armLoadFailure();
				failureArmed = true;
			}}
		>
			{failureArmed ? "Next load will fail" : "Fail next load"}
		</button>
		<button class="secondary" onclick={onRecreate}>Recreate wizard</button>
	</div>

	<p class="description">
		A loaded step is cached per wizard; hovering “Next” on the first step prefetches
		it with <code>preloadStep</code>. “Fail next load” only matters before the step
		has loaded once — recreate the wizard to try it again.
	</p>
</section>
```

- [ ] **Step 2: Create `LazyStepsExample.svelte`**

```svelte
<script lang="ts">
	import LazyStepsWizard from "./LazyStepsWizard.svelte";

	let generation = $state(0);
</script>

{#key generation}
	<LazyStepsWizard onRecreate={() => (generation += 1)} />
{/key}
```

- [ ] **Step 3: Wire it** in `App.svelte`: `type Tab = "store" | "runes" | "context" | "lazy";`, add `{ id: "lazy", label: "Lazy Steps" }` to `TABS`, `import LazyStepsExample from "./LazyStepsExample.svelte";`, and an `{:else if tab === "lazy"}<LazyStepsExample />` branch in the render chain.

- [ ] **Step 4: Verify** — example package `typecheck` (svelte-check) + `build`; click through in the browser.

- [ ] **Step 5: Commit**

```bash
git add examples/svelte-examples
git commit -m "docs(examples): Svelte lazy steps demo (WIZ-013)"
```

---

## Task 19: Solid example

**Files:**
- Create: `examples/solid-examples/src/LazyStepsExample.tsx`
- Modify: `examples/solid-examples/src/App.tsx` (`Tab`, `TABS`, `<Switch>`)

- [ ] **Step 1: Create the component**

```tsx
import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
import { type LazyDemoData, lazyInitialData } from "./lazy-steps/types";

function LazyStepsWizard(props: { onRecreate: () => void }) {
	const [loadError, setLoadError] = createSignal<string | null>(null);
	const [failureArmed, setFailureArmed] = createSignal(false);

	const wizard = createWizard<LazyDemoData>({
		definition: createLazyStepsWizard(),
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				const cause = error.cause instanceof Error ? error.cause.message : "";
				setLoadError(`${error.message}${cause ? ` — ${cause}` : ""}`);
				setFailureArmed(false);
			}
		},
		onStepEnter: () => setLoadError(null),
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const email = wizard.field("email");
	const passport = wizard.field("passport");

	const next = () => {
		setLoadError(null);
		void wizard.goNext().catch(() => {});
	};
	const prefetch = () => {
		if (wizard.currentStepId === "account") {
			void wizard.actions.preloadStep("documents").catch(() => {});
		}
	};

	return (
		<section class="panel">
			<h2>{wizard.currentStep.meta?.title}</h2>
			<p class="description">{wizard.currentStep.meta?.description}</p>

			<Show when={wizard.isLoadingStep}>
				<p class="description">Loading step implementation…</p>
			</Show>
			<Show when={loadError()}>
				{(message) => <p class="error">{message()}</p>}
			</Show>

			<Switch>
				<Match when={wizard.currentStepId === "account"}>
					<label>
						<span>Email</span>
						<input
							value={email.value}
							onInput={(e) => {
								email.value = e.currentTarget.value;
							}}
							placeholder="ada@example.com"
						/>
					</label>
				</Match>
				<Match when={wizard.currentStepId === "documents"}>
					<label>
						<span>Passport number</span>
						<input
							value={passport.value}
							onInput={(e) => {
								passport.value = e.currentTarget.value;
							}}
							placeholder="AB1234567"
						/>
					</label>
				</Match>
				<Match when={wizard.currentStepId === "summary"}>
					<pre class="debug">{JSON.stringify(wizard.data, null, 2)}</pre>
				</Match>
			</Switch>

			<For each={Object.entries(wizard.validationErrors ?? {})}>
				{([, message]) => <p class="error">{message}</p>}
			</For>

			<div class="controls">
				<button
					type="button"
					class="secondary"
					onClick={() => void wizard.goPrevious().catch(() => {})}
					disabled={!wizard.canGoPrevious || wizard.isNavigating}
				>
					Back
				</button>
				<Show
					when={wizard.isLastStep}
					fallback={
						<button
							type="button"
							onClick={next}
							onMouseEnter={prefetch}
							disabled={wizard.isNavigating}
						>
							{wizard.isLoadingStep ? "Loading…" : "Next"}
						</button>
					}
				>
					<button
						type="button"
						onClick={() => void wizard.actions.submit().catch(() => {})}
					>
						Finish
					</button>
				</Show>
				<span class="spacer" />
				<button
					type="button"
					class="secondary"
					onClick={() => {
						armLoadFailure();
						setFailureArmed(true);
					}}
				>
					{failureArmed() ? "Next load will fail" : "Fail next load"}
				</button>
				<button type="button" class="secondary" onClick={() => props.onRecreate()}>
					Recreate wizard
				</button>
			</div>

			<p class="description">
				A loaded step is cached per wizard; hovering “Next” on the first step
				prefetches it with <code>preloadStep</code>. “Fail next load” only
				matters before the step has loaded once — recreate the wizard to try it
				again.
			</p>
		</section>
	);
}

export function LazyStepsExample() {
	const [generation, setGeneration] = createSignal(1);
	return (
		<Show when={generation()} keyed>
			{() => <LazyStepsWizard onRecreate={() => setGeneration((g) => g + 1)} />}
		</Show>
	);
}
```

- [ ] **Step 2: Wire it** in `App.tsx`: `type Tab = "basic" | "context" | "lazy";`, `{ id: "lazy", label: "Lazy Steps" }` in `TABS`, import `LazyStepsExample`, and `<Match when={tab() === "lazy"}><LazyStepsExample /></Match>`.

- [ ] **Step 3: Verify** — example `typecheck` + `build`; click through in the browser.

- [ ] **Step 4: Commit**

```bash
git add examples/solid-examples
git commit -m "docs(examples): Solid lazy steps demo (WIZ-013)"
```

---

## Task 20: Documentation, READMEs, agent skill

**Files:**
- Modify: `packages/docs/guide/defining-wizards.md` and `docs/defining-wizards.md` (new "Lazy steps" section under "Advanced Patterns", after "Dynamic Navigation")
- Modify: `packages/docs/guide/core-concepts.md`, `docs/core-concepts.md` (state description)
- Modify: `packages/docs/guide/plugins.md`, `docs/plugins.md` (`"load"` phase)
- Modify: `packages/docs/guide/api/core.md`, `docs/api/core.md`, `docs/api-reference.md`
- Modify: `packages/docs/guide/api/{react,vue,svelte,solid}.md`, `docs/api/{react,vue,svelte,solid}.md`, and the four `*-integration.md` guides in both trees (loading slice + `actions.preloadStep`)
- Modify: `packages/core/README.md`, binding READMEs where loading flags / actions are listed
- Modify: `.agents/skills/wizard-library/references/api_reference.md`, `architecture_and_changes.md`

- [ ] **Step 1: Write the "Lazy steps" guide section** (same text in both `defining-wizards.md` files):

````markdown
### Lazy Steps

Large wizards can defer a step's heavy implementation — validation schemas, lifecycle code — until the step is actually used. The step **skeleton** (`id`, `next`, `previous`, `enabled`, `meta`) stays in the definition, so progress, `isLastStep` and disabled-step skipping never wait for a download. Only `validate`, `onEnter`, `onLeave` and `onSubmit` are loaded lazily.

```ts
// steps/documents.ts — becomes its own chunk
import type { LazyStepImplementation } from "@gooonzick/wizard-core";
export default {
	validate: createStandardSchemaValidator(heavyDocumentsSchema),
	onEnter: async (data, ctx) => { /* … */ },
} satisfies LazyStepImplementation<Application>;

// wizard.ts
createWizard<Application>("loan")
	.step("documents", (s) =>
		s.title("Documents").previous("personal").next("summary")
			.lazy(() => import("./steps/documents")),
	);
```

Declaratively, set `load: () => import("./steps/documents")` on the step definition. The loader may resolve to the implementation object or to a module namespace with a `default` export. If a hook is defined both on the skeleton and in the loaded implementation, the loaded one wins.

**When it loads.** The first time the implementation is needed: navigating into or out of the step (before `beforeTransition`, `onLeave` and any state change), validating or submitting it, or entering it as the initial step. `validateAll()` loads every enabled lazy step. A successful load is cached for the lifetime of the machine (it survives `reset()`); `goTo(id, { skipLifecycle: true })` does not load.

**Loading state.** `snapshot.isLoadingStep` (and `isLoadingStep` in every binding's loading slice) is `true` while the current or target step loads — show a spinner with it.

**Prefetching.** `machine.preloadStep("documents")` (or `actions.preloadStep` in a binding) starts the load without navigating — e.g. on hover of “Next”. It does not set `isLoadingStep`.

**Errors.** A failed load rejects the navigation / `submit()` with `WizardStepLoadError` (`stepId`, original error as `cause`), is reported once through `onError` and plugin `onError` with `phase: "load"`, and leaves the wizard on the current step. Failed loads are not cached — the next attempt retries. `validate()` resolves `{ valid: false, errors: { general: "Failed to load step" } }`; `validateAll()` marks the step invalid with `errors._error`.
````

- [ ] **Step 2: Other doc touch-points** (both trees):
  - `core-concepts.md`: add `isLoadingStep` to the `WizardState` field list with "true while a lazy step's implementation loads (WIZ-013)".
  - `plugins.md`: in the `ErrorContext.phase` table/list add `"load"` — "a lazy step failed to load (WIZ-013)" — and note that plugins with an exhaustive `switch` on `phase` need the case.
  - `api/core.md` + `docs/api-reference.md`: `WizardStepDefinition.load`, `StepLoader`, `LazyStepImplementation`, `StepBuilder.lazy()`, `WizardMachine.preloadStep()`, `WizardStepLoadError`, `WizardState.isLoadingStep`.
  - `api/{react,vue,svelte,solid}.md` + integration guides: `isLoadingStep` in the loading slice (Svelte runes / Solid: also the flat getter) and `actions.preloadStep(stepId)`.

- [ ] **Step 3: READMEs and agent skill**
  - `packages/core/README.md`: short "Lazy steps" bullet/section linking to the guide.
  - Binding READMEs: add `isLoadingStep` wherever `isNavigating` is listed and `preloadStep` wherever actions are listed.
  - `.agents/skills/wizard-library/references/api_reference.md`: the new API; `architecture_and_changes.md`: a WIZ-013 entry (skeleton-eager design, load points, cache semantics, `"load"` phase, `isLoadingStep` ownership in `wizard-state`).

- [ ] **Step 4: Verify docs build**

Run: `pnpm docs:build`
Expected: PASS (no dead-link errors).

- [ ] **Step 5: Commit**

```bash
git add packages/docs docs .agents packages/*/README.md
git commit -m "docs: document lazy steps (WIZ-013)"
```

---

## Task 21: Changeset, ROADMAP, final verification

**Files:**
- Create: `.changeset/wiz-013-lazy-steps.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Changeset**

```markdown
---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-solid": minor
---

Add lazy steps (WIZ-013). A step can load its implementation — `validate`, `onEnter`, `onLeave`, `onSubmit` — on first use via `load: () => import("./step")` or `StepBuilder.lazy()`, while its transitions, `enabled` guard and `meta` stay eager (so progress, `isLastStep` and disabled-step skipping never wait for a load). Loads are cached per machine, shared between concurrent callers and retried after a failure.

- `WizardState.isLoadingStep` is `true` while the current or target step loads; `@gooonzick/wizard-state` mirrors it into the loading slice, and React, Vue, Svelte (stores + runes) and Solid expose it next to `isNavigating`.
- `machine.preloadStep(stepId)` / `actions.preloadStep(stepId)` prefetch a step without navigating.
- A failed load rejects the operation with the new `WizardStepLoadError` and leaves the wizard on the current step.

**Behaviour change:** load failures are reported through `onError` and plugin `onError` with the new `ErrorContext.phase` value `"load"` — plugins with an exhaustive `switch` on `phase` need a `"load"` case. `WizardState` gains the required `isLoadingStep` field; code that hand-builds `WizardState` objects (test fakes) must add it.
```

- [ ] **Step 2: ROADMAP** — edit `docs/ROADMAP.md`:
  - WIZ-013 header: `**Status:** ✅ Done (see "Shipped vs. specced deltas")`; append a `##### Shipped vs. specced deltas` list: implementation-only laziness via `load` on the step (skeleton eager) instead of a function step value; `StepBuilder.lazy()` instead of `WizardBuilder.lazyStep()`; `preloadStep` (machine + binding actions); `WizardStepLoadError` + plugin phase `"load"`; `isLoadingStep` also exposed by `wizard-state` and every binding; loads happen before `beforeTransition`, so a failed load never half-commits; failed loads are not cached; ships in **1.12.0**.
  - "What is Already Implemented": add `| Lazy steps (WIZ-013) | ✅ | \`core\` |`.
  - Release table: add `| 1.12.0 | Lazy steps (WIZ-013): \`load\` / \`.lazy()\`, \`isLoadingStep\`, \`preloadStep\`, \`WizardStepLoadError\` |`; set the published-version sentence to stay at 1.11.2 with "1.12.0 (next)" — mirror how 1.10.0 was marked before release.
  - "Remaining backlog": WIZ-011, WIZ-012.
  - Appendix A: `WIZ-013 Lazy Steps ── independent ✅ 1.12.0`.
  - Appendix B: WIZ-013 row mitigation → "Additive, non-breaking (optional `load` field)"; replace the "Reserve a major (v2.0.0) for WIZ-013…" sentence with "WIZ-013 shipped additively in 1.12.0; WIZ-011 and WIZ-012 remain additive minors."

- [ ] **Step 3: Final verification**

Run: `pnpm lint:fix && pnpm typecheck && pnpm test && pnpm build && pnpm docs:build`
Expected: all green. Review `git diff` of any `lint:fix` changes.

- [ ] **Step 4: Commit**

```bash
git add .changeset/wiz-013-lazy-steps.md docs/ROADMAP.md
git commit -m "chore: changeset and roadmap for WIZ-013 lazy steps"
```

Then hand off to superpowers:finishing-a-development-branch (open one PR against `main`).
