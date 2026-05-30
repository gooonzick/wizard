# WIZ-007 Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime plugin system to `WizardMachine` with global transition/lifecycle hooks (init, before/after transition with veto, error, complete, reset, destroy), one reference `createLoggingPlugin`, and React/Vue/state wiring + a `./plugins` subpath export.

**Architecture:** A new `PluginHost` helper class owns an ordered plugin list and all dispatch logic (registration order; `destroy` in reverse), keeping `wizard-machine.ts` lean. The machine holds one `PluginHost`, calls into it at transition/lifecycle points, and injects an error reporter so isolated hook throws route to `onError`. Hook payloads are typed `DeepReadonly<T>` (compile-time only; live references, not clones). React/Vue thread a `plugins` option into the machine constructor's new 5th positional arg, and a new `manager.destroy()` runs plugin `destroy` on unmount/dispose.

**Tech Stack:** TypeScript, Vitest (incl. `expectTypeOf` type tests), Vite library build with `vite-plugin-dts`, pnpm + Turborepo monorepo, Changesets (fixed group of 4 packages).

---

## Package manager & commands (verified)

- **Package manager: `pnpm@10.23.0`** — evidence: root `package.json` has `"packageManager": "pnpm@10.23.0"`; there is no `package-lock.json`/`yarn.lock`. Turborepo (`turbo.json`) orchestrates the monorepo, but per-package commands are run via `pnpm --filter`.
- Each package's `test` script is `vitest --run`; `build` is `vite build`.
- **Core test (one file):** `pnpm --filter @gooonzick/wizard-core test -- plugins`
  (`vitest --run plugins` → runs only test files whose path matches `plugins`).
- **Core test (all):** `pnpm --filter @gooonzick/wizard-core test`
- **Core typecheck:** `pnpm --filter @gooonzick/wizard-core typecheck`
- **Core build:** `pnpm --filter @gooonzick/wizard-core build`
- **State test:** `pnpm --filter @gooonzick/wizard-state test`
- **React test:** `pnpm --filter @gooonzick/wizard-react test` (one file: `... test -- plugins`)
- **Vue test:** `pnpm --filter @gooonzick/wizard-vue test` (one file: `... test -- plugins`)
- **Docs build:** `pnpm docs:build` (turbo `build --filter=@gooonzick/wizard-docs`)
- **Lint (Biome):** `pnpm --filter @gooonzick/wizard-core lint:fix`

> NOTE on build ordering: `vitest` for `react`/`vue`/`state` depends on `@gooonzick/wizard-core` being **built** (turbo `test` has `dependsOn: ["^build"]`). When running a package test directly with `pnpm --filter`, first run `pnpm --filter @gooonzick/wizard-core build` so the consumers resolve the new exports/types.

---

## File Structure

| File | Create / Modify | Single responsibility |
| --- | --- | --- |
| `packages/core/src/plugins/types.ts` | Create | `DeepReadonly<T>`, `TransitionEvent`, `ErrorContext`, `WizardMachineReadonly`, `WizardPlugin` interfaces. |
| `packages/core/src/plugins/plugin-host.ts` | Create | `PluginHost` class: ordered list + all hook dispatch (register/remove/destroy/dispatch*). |
| `packages/core/src/plugins/logging.ts` | Create | `createLoggingPlugin` reference plugin. |
| `packages/core/src/plugins/index.ts` | Create | Subpath barrel re-exporting plugin types + `createLoggingPlugin`. |
| `packages/core/src/machine/wizard-machine.ts` | Modify | 5th `plugins` ctor arg, `PluginHost` field, `use()`/`removePlugin()`/`destroy()`, readonly facade, hook dispatch in `navigateToStep`/`handleError`/`complete`/`reset`, `type` threading. |
| `packages/core/src/index.ts` | Modify | Re-export plugin public types + `createLoggingPlugin`; append at the end of `packages/core/src/index.ts` (currently 79 lines). |
| `packages/core/package.json` | Modify | Add `exports["./plugins"]`. |
| `packages/core/vite.config.ts` | Modify | Multi-entry lib build (`{ index, plugins }`). |
| `packages/core/tests/plugins.test.ts` | Create | All core plugin unit/integration tests. |
| `packages/core/tests/plugin-types.test-d.ts` *(see note)* | Create | Type-level tests via `expectTypeOf`. (Co-located in `plugins.test.ts` is also fine — see Task 1.) |
| `packages/state/src/manager.ts` | Modify | New `destroy()` calling `machine.destroy()`. |
| `packages/state/tests/manager.test.ts` *(or new file)* | Create/Modify | Test `manager.destroy()`. |
| `packages/react/src/use-wizard.tsx` | Modify | `plugins` option → 5th ctor arg; `useEffect` cleanup `manager.destroy()`. |
| `packages/react/src/wizard-provider.tsx` | Modify | `plugins` prop → 5th ctor arg; `useEffect` cleanup. |
| `packages/react/tests/plugins.test.tsx` | Create | React threading + destroy-on-unmount. |
| `packages/vue/src/use-wizard.ts` | Modify | `plugins` option → 5th ctor arg; `manager.destroy()` in existing `onScopeDispose`. |
| `packages/vue/src/types.ts` | Modify | Add `plugins?` to `UseWizardOptions`. |
| `packages/vue/src/wizard-provider.ts` | Modify | Add `plugins` prop; forward into internal `useWizard(...)`. |
| `packages/vue/tests/plugins.test.ts` | Create | Vue threading + destroy-on-dispose. |
| `packages/docs/guide/plugins.md` | Create | Plugin guide. |
| `packages/docs/.vitepress/config.ts` | Modify | Sidebar entry for Plugins. |
| `packages/docs/guide/api/core.md` | Modify | New machine methods/types. |
| `docs/api-reference.md` | Modify | Plugins / Middleware section. |
| `docs/core-concepts.md` | Modify | Conceptual plugin mention. |
| `docs/ROADMAP.md` | Modify | Mark WIZ-007 ✅, rewrite API block, WIZ-010 note. |
| `.changeset/wiz-007-plugin-system.md` | Create | Minor changeset (4 packages). |

> **Type-test note:** the repo's `packages/core/tests/types.test.ts` puts `expectTypeOf` tests inside normal `.test.ts` files run by Vitest. Follow that convention: put the `DeepReadonly`/`WizardPlugin` type assertions in `plugins.test.ts` (they execute as no-op runtime tests but fail the build if types regress). Do NOT introduce a separate `.test-d.ts` tooling step.

---

## Tasks

### Task 1: Plugin types + `DeepReadonly`

**Files:**
- Create: `packages/core/src/plugins/types.ts`
- Test: `packages/core/tests/plugins.test.ts` (type-level section)

- [ ] **Step 1: Write the failing test** (create `packages/core/tests/plugins.test.ts`)
```ts
import { describe, expectTypeOf, test } from "vitest";
import type { WizardError } from "../src/errors";
import type { StepStatus } from "../src/types/step";
import type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "../src/plugins/types";

interface Data {
	name: string;
	nested: { count: number; tags: string[] };
}

describe("plugin types", () => {
	test("DeepReadonly makes nested properties readonly", () => {
		expectTypeOf<DeepReadonly<Data>>().toEqualTypeOf<{
			readonly name: string;
			readonly nested: {
				readonly count: number;
				readonly tags: readonly string[];
			};
		}>();
	});

	test("TransitionEvent carries a readonly data payload and a typed `type`", () => {
		expectTypeOf<TransitionEvent<Data>["type"]>().toEqualTypeOf<
			"next" | "previous" | "goTo"
		>();
		expectTypeOf<TransitionEvent<Data>["data"]>().toEqualTypeOf<
			DeepReadonly<Data>
		>();
		expectTypeOf<TransitionEvent<Data>["fromStepId"]>().toEqualTypeOf<string>();
		expectTypeOf<TransitionEvent<Data>["timestamp"]>().toEqualTypeOf<number>();
	});

	test("ErrorContext phase is a fixed union", () => {
		expectTypeOf<ErrorContext<Data>["phase"]>().toEqualTypeOf<
			"validation" | "transition" | "lifecycle" | "submit"
		>();
	});

	test("WizardMachineReadonly exposes read-only views", () => {
		expectTypeOf<WizardMachineReadonly<Data>>().toHaveProperty("snapshot");
		expectTypeOf<WizardMachineReadonly<Data>>().toHaveProperty("currentStep");
		expectTypeOf<
			WizardMachineReadonly<Data>["getStepStatus"]
		>().toEqualTypeOf<(stepId: string) => StepStatus>();
	});

	test("WizardPlugin has a required name and optional hooks", () => {
		expectTypeOf<WizardPlugin<Data>["name"]>().toEqualTypeOf<string>();
		const p: WizardPlugin<Data> = { name: "x" };
		expectTypeOf(p.onError).parameter(0).toEqualTypeOf<
			WizardError | Error
		>();
		// beforeTransition may veto with `false`
		const veto: WizardPlugin<Data>["beforeTransition"] = () => false;
		expectTypeOf(veto).not.toBeUndefined();
	});

	test("WizardPlugin does NOT include onDataChange (deferred to WIZ-010)", () => {
		// @ts-expect-error onDataChange is intentionally not part of the interface
		const _p: WizardPlugin<Data> = { name: "x", onDataChange: () => {} };
		void _p;
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins`
Expected: FAIL — `Cannot find module '../src/plugins/types'` (file does not exist yet).
- [ ] **Step 3: Implement** (create `packages/core/src/plugins/types.ts`)
```ts
import type { WizardError } from "../errors";
import type { StepId } from "../types/base";
import type { StepStatus, WizardStepDefinition } from "../types/step";
import type { WizardState } from "../machine/wizard-machine";

/**
 * Recursive readonly mapped type. Compile-time only — applied to plugin hook
 * payloads so plugins cannot mutate the machine's live state references.
 * Zero runtime cost: payloads are NOT cloned. Functions are left untouched.
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: T extends ReadonlyArray<infer U>
		? ReadonlyArray<DeepReadonly<U>>
		: T extends object
			? { readonly [K in keyof T]: DeepReadonly<T[K]> }
			: T;

/** Payload passed to beforeTransition / afterTransition. */
export interface TransitionEvent<TData> {
	type: "next" | "previous" | "goTo";
	fromStepId: StepId;
	toStepId: StepId;
	data: DeepReadonly<TData>;
	timestamp: number;
}

/** Context passed to a plugin's onError hook. */
export interface ErrorContext<TData> {
	stepId: StepId;
	phase: "validation" | "transition" | "lifecycle" | "submit";
	data: DeepReadonly<TData>;
}

/** Read-only machine view passed to onInit so plugins can inspect, not mutate. */
export interface WizardMachineReadonly<TData> {
	readonly snapshot: DeepReadonly<WizardState<TData>>;
	readonly currentStep: DeepReadonly<WizardStepDefinition<TData>>;
	getStepStatus(stepId: StepId): StepStatus;
}

/**
 * A runtime plugin registered on a WizardMachine. All hooks are optional
 * except `name` (unique; used by removePlugin). `onDataChange` is intentionally
 * omitted (deferred to WIZ-010).
 */
export interface WizardPlugin<TData = unknown> {
	name: string;
	onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;
	/** Return `false` to veto the transition (silent cancel). */
	beforeTransition?(
		e: TransitionEvent<TData>,
	): boolean | void | Promise<boolean | void>;
	afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;
	onError?(
		error: WizardError | Error,
		ctx: ErrorContext<TData>,
	): void | Promise<void>;
	onComplete?(data: DeepReadonly<TData>): void | Promise<void>;
	onReset?(): void | Promise<void>;
	destroy?(): void | Promise<void>;
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins` → PASS.
Also `pnpm --filter @gooonzick/wizard-core typecheck` → no errors.
- [ ] **Step 5: Commit**
```bash
git checkout -b feat/wiz-007-plugin-system
git add packages/core/src/plugins/types.ts packages/core/tests/plugins.test.ts && \
git commit -m "feat(core): add WizardPlugin types and DeepReadonly helper (WIZ-007)"
```

---

### Task 2: `PluginHost` dispatch helper

**Files:**
- Create: `packages/core/src/plugins/plugin-host.ts`
- Test: `packages/core/tests/plugin-host.test.ts`

The `PluginHost` is unit-testable in isolation with fake plugins. It receives an injected error reporter so the machine controls how isolated hook throws are surfaced. It does NOT know about the machine internals.

- [ ] **Step 1: Write the failing test** (create `packages/core/tests/plugin-host.test.ts`)
```ts
import { describe, expect, it, vi } from "vitest";
import { WizardConfigurationError } from "../src/errors";
import { PluginHost } from "../src/plugins/plugin-host";
import type { TransitionEvent, WizardPlugin } from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const ev = (over: Partial<TransitionEvent<D>> = {}): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
	...over,
});

const makeHost = () => {
	const reported: unknown[] = [];
	const host = new PluginHost<D>((err) => {
		reported.push(err);
	});
	return { host, reported };
};

describe("PluginHost", () => {
	it("registers plugins and lists them in registration order", () => {
		const { host } = makeHost();
		host.add({ name: "a" });
		host.add({ name: "b" });
		expect(host.list().map((p) => p.name)).toEqual(["a", "b"]);
	});

	it("throws WizardConfigurationError on duplicate name", () => {
		const { host } = makeHost();
		host.add({ name: "dup" });
		expect(() => host.add({ name: "dup" })).toThrow(WizardConfigurationError);
	});

	it("remove calls destroy and drops the plugin", async () => {
		const { host } = makeHost();
		const destroy = vi.fn();
		host.add({ name: "a", destroy });
		await host.remove("a");
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(host.list()).toHaveLength(0);
	});

	it("dispatchBeforeTransition awaits sequentially and returns false on veto", async () => {
		const { host } = makeHost();
		const order: string[] = [];
		host.add({
			name: "a",
			beforeTransition: async () => {
				order.push("a");
			},
		});
		host.add({
			name: "veto",
			beforeTransition: () => {
				order.push("veto");
				return false;
			},
		});
		host.add({
			name: "never",
			beforeTransition: () => {
				order.push("never");
			},
		});
		const ok = await host.dispatchBeforeTransition(ev());
		expect(ok).toBe(false);
		expect(order).toEqual(["a", "veto"]); // stops at veto
	});

	it("dispatchBeforeTransition propagates a thrown error to the caller", async () => {
		const { host } = makeHost();
		const boom = new Error("boom");
		host.add({
			name: "a",
			beforeTransition: () => {
				throw boom;
			},
		});
		await expect(host.dispatchBeforeTransition(ev())).rejects.toBe(boom);
	});

	it("dispatchAfterTransition isolates throws and reports them, continuing", async () => {
		const { host, reported } = makeHost();
		const second = vi.fn();
		host.add({
			name: "a",
			afterTransition: () => {
				throw new Error("after-fail");
			},
		});
		host.add({ name: "b", afterTransition: second });
		await host.dispatchAfterTransition(ev());
		expect(second).toHaveBeenCalledTimes(1);
		expect(reported).toHaveLength(1);
	});

	it("dispatchError isolates onError throws (no recursion) via console.error", async () => {
		const { host, reported } = makeHost();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		host.add({
			name: "a",
			onError: () => {
				throw new Error("inside-onError");
			},
		});
		await host.dispatchError(new Error("orig"), {
			stepId: "a",
			phase: "transition",
			data: { value: 1 },
		});
		expect(reported).toHaveLength(0); // NOT re-reported (no recursion)
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("destroyAll runs in reverse registration order, isolated", async () => {
		const { host } = makeHost();
		const order: string[] = [];
		host.add({ name: "a", destroy: () => void order.push("a") });
		host.add({
			name: "b",
			destroy: () => {
				order.push("b");
				throw new Error("b-fail");
			},
		});
		host.add({ name: "c", destroy: () => void order.push("c") });
		await host.destroyAll();
		expect(order).toEqual(["c", "b", "a"]);
		expect(host.list()).toHaveLength(0);
	});

	it("dispatchInit is fire-and-forget and routes rejections to onError", async () => {
		const { host, reported } = makeHost();
		host.add({
			name: "a",
			onInit: async () => {
				throw new Error("init-fail");
			},
		});
		host.dispatchInit({
			snapshot: {} as never,
			currentStep: {} as never,
			getStepStatus: () => "active",
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(reported).toHaveLength(1);
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugin-host`
Expected: FAIL — `Cannot find module '../src/plugins/plugin-host'`.
- [ ] **Step 3: Implement** (create `packages/core/src/plugins/plugin-host.ts`)
```ts
import { WizardConfigurationError } from "../errors";
import type { WizardError } from "../errors";
import type {
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";

/** Reports an isolated hook throw back to the machine (which routes to onError). */
export type PluginErrorReporter = (error: unknown) => void;

/**
 * Owns the ordered plugin list and all hook dispatch logic. The machine holds
 * one PluginHost and injects an error reporter for isolated hook throws.
 *
 * Dispatch ordering: registration order, EXCEPT destroyAll which is reverse.
 */
export class PluginHost<TData> {
	private plugins: WizardPlugin<TData>[] = [];

	constructor(private readonly reportError: PluginErrorReporter) {}

	/** Registers a plugin. Throws on duplicate name. */
	add(plugin: WizardPlugin<TData>): void {
		if (this.plugins.some((p) => p.name === plugin.name)) {
			throw new WizardConfigurationError(
				`Plugin "${plugin.name}" is already registered`,
			);
		}
		this.plugins.push(plugin);
	}

	/** Removes a plugin by name, calling its destroy() first. No-op if absent. */
	async remove(name: string): Promise<void> {
		const index = this.plugins.findIndex((p) => p.name === name);
		if (index === -1) {
			return;
		}
		const [plugin] = this.plugins.splice(index, 1);
		await this.runIsolated(() => plugin.destroy?.());
	}

	/** Ordered (registration-order) snapshot of registered plugins. */
	list(): readonly WizardPlugin<TData>[] {
		return this.plugins;
	}

	/** Fire-and-forget onInit dispatch; rejections routed to the error reporter. */
	dispatchInit(view: WizardMachineReadonly<TData>): void {
		for (const plugin of this.plugins) {
			if (!plugin.onInit) {
				continue;
			}
			try {
				const result = plugin.onInit(view);
				if (result instanceof Promise) {
					result.catch((err) => this.reportError(err));
				}
			} catch (err) {
				this.reportError(err);
			}
		}
	}

	/** Fire-and-forget onInit for a single (late-added) plugin. */
	dispatchInitOne(plugin: WizardPlugin<TData>, view: WizardMachineReadonly<TData>): void {
		if (!plugin.onInit) {
			return;
		}
		try {
			const result = plugin.onInit(view);
			if (result instanceof Promise) {
				result.catch((err) => this.reportError(err));
			}
		} catch (err) {
			this.reportError(err);
		}
	}

	/**
	 * Sequentially awaits each beforeTransition. Returns `false` as soon as a
	 * plugin vetoes (stops dispatching further). A THROW propagates to the caller
	 * (navigateToStep rethrows it; withTransition's catch reports it once).
	 */
	async dispatchBeforeTransition(e: TransitionEvent<TData>): Promise<boolean> {
		for (const plugin of this.plugins) {
			if (!plugin.beforeTransition) {
				continue;
			}
			const result = await plugin.beforeTransition(e);
			if (result === false) {
				return false;
			}
		}
		return true;
	}

	/** Isolated: each throw is reported; remaining plugins still run. */
	async dispatchAfterTransition(e: TransitionEvent<TData>): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.afterTransition?.(e));
		}
	}

	/** Isolated onComplete dispatch. */
	async dispatchComplete(data: TData): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.onComplete?.(data));
		}
	}

	/** Isolated onReset dispatch. */
	async dispatchReset(): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.onReset?.());
		}
	}

	/**
	 * Isolated onError dispatch. A throw INSIDE a plugin's onError is swallowed
	 * (at most console.error) — never re-routed, to prevent infinite recursion.
	 */
	async dispatchError(
		error: WizardError | Error,
		ctx: ErrorContext<TData>,
	): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onError) {
				continue;
			}
			try {
				await plugin.onError(error, ctx);
			} catch (innerError) {
				// Swallow — do NOT re-route through reportError (no recursion).
				console.error(
					`[WizardMachine] plugin "${plugin.name}" onError threw`,
					innerError,
				);
			}
		}
	}

	/** Runs all plugins' destroy() in REVERSE registration order, isolated. */
	async destroyAll(): Promise<void> {
		const reversed = [...this.plugins].reverse();
		this.plugins = [];
		for (const plugin of reversed) {
			await this.runIsolated(() => plugin.destroy?.());
		}
	}

	/** Awaits a hook, catching + reporting any throw/rejection. */
	private async runIsolated(fn: () => void | Promise<void>): Promise<void> {
		try {
			await fn();
		} catch (err) {
			this.reportError(err);
		}
	}
}
```
> `WizardError` is referenced only in a type position in `dispatchError`'s signature, so it is imported explicitly via `import type { WizardError } from "../errors";` (included in the implementation block above).
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugin-host` → PASS. Then `pnpm --filter @gooonzick/wizard-core typecheck`.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/plugins/plugin-host.ts packages/core/tests/plugin-host.test.ts && \
git commit -m "feat(core): add PluginHost dispatch helper (WIZ-007)"
```

---

### Task 3: Machine — constructor `plugins`, `use()`, `removePlugin()`, `destroy()`, readonly facade

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (imports; fields after L113; constructor L115-145; new methods)
- Test: `packages/core/tests/plugins.test.ts`

- [ ] **Step 1: Write the failing test** (append to `packages/core/tests/plugins.test.ts`)
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WizardConfigurationError } from "../src/errors";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import {
	createSimpleLinearDefinition,
	type SimpleData,
} from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

describe("WizardMachine plugin registration", () => {
	it("fires onInit on construction with a read-only machine view", async () => {
		const onInit = vi.fn();
		new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", onInit }],
		);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
		const view = onInit.mock.calls[0][0];
		expect(view.snapshot.currentStepId).toBe("step1");
		expect(view.currentStep.id).toBe("step1");
		expect(view.getStepStatus("step1")).toBe("active");
	});

	it("use() is chainable and fires onInit immediately (fire-and-forget)", async () => {
		const onInit = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		const returned = m.use({ name: "late", onInit });
		expect(returned).toBe(m);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("use() throws WizardConfigurationError on duplicate name", () => {
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		m.use({ name: "dup" });
		expect(() => m.use({ name: "dup" })).toThrow(WizardConfigurationError);
	});

	it("removePlugin calls destroy and drops the plugin", async () => {
		const destroy = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", destroy }],
		);
		await m.removePlugin("p");
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("destroy() runs all plugins in reverse registration order", async () => {
		const order: string[] = [];
		const mk = (name: string): WizardPlugin<SimpleData> => ({
			name,
			destroy: () => void order.push(name),
		});
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[mk("a"), mk("b"), mk("c")],
		);
		await m.destroy();
		expect(order).toEqual(["c", "b", "a"]);
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins`
Expected: FAIL — `Expected 4 arguments, but got 5` / `m.use is not a function` / `m.destroy is not a function`.
- [ ] **Step 3: Implement** (edits to `packages/core/src/machine/wizard-machine.ts`)

3a. Add imports near the top (after existing imports, before `WizardState`):
```ts
import { PluginHost } from "../plugins/plugin-host";
import type {
	WizardMachineReadonly,
	WizardPlugin,
} from "../plugins/types";
```

3b. Add fields after `private initialData: T;` (currently L113):
```ts
	/** Owns the ordered plugin list and all hook dispatch (WIZ-007). */
	private pluginHost: PluginHost<T>;
	/** Read-only facade passed to plugin onInit. */
	private readonly readonlyFacade: WizardMachineReadonly<T>;
```

3c. Change the constructor signature (L115-120) to add the 5th arg, and instantiate the host after the initial state seeding. Replace the current constructor body's tail:
```ts
	constructor(
		definition: WizardDefinition<T>,
		context: WizardContext,
		initialData: T,
		events?: WizardEvents<T>,
		plugins?: WizardPlugin<T>[],
	) {
		this.definition = definition;
		this.context = context;
		this.events = events || {};

		if (!definition.steps[definition.initialStepId]) {
			throw new WizardConfigurationError(
				`Initial step "${definition.initialStepId}" not found`,
			);
		}

		this.initialData = this.cloneData(initialData);
		this.state = {
			currentStepId: definition.initialStepId,
			data: this.cloneData(initialData),
			isValid: true,
			isCompleted: false,
			canGoBack: false,
			stepStatuses: this.initializeStepStatuses(),
		};
		this.visitedSteps.add(definition.initialStepId);
		this.stepHistory.push(definition.initialStepId);

		// WIZ-007: plugin host + readonly facade. The host's error reporter routes
		// isolated hook throws through handleError (phase defaults to "transition").
		this.pluginHost = new PluginHost<T>((err) => this.handleError(err));
		// Object literal getters cannot use the outer `this`, so capture it in
		// `machineRef`.
		const machineRef = this;
		this.readonlyFacade = {
			get snapshot() {
				return machineRef.snapshot as never;
			},
			get currentStep() {
				return machineRef.currentStep as never;
			},
			getStepStatus: (stepId) => this.getStepStatus(stepId),
		};
		// Register constructor plugins in array order.
		if (plugins) {
			for (const plugin of plugins) {
				this.pluginHost.add(plugin);
			}
		}

		// Fire onStepEnter for initial step (async, non-blocking)
		this.initializeFirstStep();

		// WIZ-007: fire onInit for constructor plugins (fire-and-forget) right
		// after initial state seeding.
		this.pluginHost.dispatchInit(this.readonlyFacade);
	}
```

3d. Add the public methods (place them right after the `snapshot` getter block, near L235, grouped with registration concerns):
```ts
	/**
	 * Registers a plugin (chainable). Throws WizardConfigurationError on a
	 * duplicate name. The plugin's onInit fires immediately (fire-and-forget).
	 */
	use(plugin: WizardPlugin<T>): this {
		this.pluginHost.add(plugin);
		this.pluginHost.dispatchInitOne(plugin, this.readonlyFacade);
		return this;
	}

	/**
	 * Removes a plugin by name, invoking its destroy() first. No-op if absent.
	 */
	async removePlugin(name: string): Promise<void> {
		await this.pluginHost.remove(name);
	}

	/**
	 * Tears down the machine: runs every plugin's destroy() in REVERSE
	 * registration order. Safe to call multiple times.
	 */
	async destroy(): Promise<void> {
		await this.pluginHost.destroyAll();
	}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins` → PASS. Then `pnpm --filter @gooonzick/wizard-core typecheck`.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/plugins.test.ts && \
git commit -m "feat(core): machine plugin registration, use/removePlugin/destroy (WIZ-007)"
```

---

### Task 4: Machine — `navigateToStep` `type` param + before/afterTransition dispatch

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`navigateToStep` L707-764; callers `goNext` L471, `goPrevious` L491 & L505, `goBack` L557, `goTo` L621)
- Test: `packages/core/tests/plugins.test.ts`

- [ ] **Step 1: Write the failing test** (append to `packages/core/tests/plugins.test.ts`)
```ts
describe("WizardMachine before/afterTransition", () => {
	it("beforeTransition fires before the step change with from/to/type for goNext", async () => {
		const before = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before }],
		);
		await m.goNext();
		expect(before).toHaveBeenCalledTimes(1);
		expect(before.mock.calls[0][0]).toMatchObject({
			type: "next",
			fromStepId: "step1",
			toStepId: "step2",
		});
	});

	it("uses type 'previous' for goPrevious and 'goTo' for goTo", async () => {
		const events: { type: string; from: string; to: string }[] = [];
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: (e) =>
						void events.push({ type: e.type, from: e.fromStepId, to: e.toStepId }),
				},
			],
		);
		await m.goNext(); // step1 -> step2 (next)
		await m.goTo("step1", { skipValidation: true }); // step2 -> step1 (goTo)
		await m.goNext(); // step1 -> step2 (next)
		await m.goPrevious(); // step2 -> step1 (previous)
		expect(events.map((e) => e.type)).toEqual([
			"next",
			"goTo",
			"next",
			"previous",
		]);
	});

	it("beforeTransition returning false silently cancels (no state change, no afterTransition)", async () => {
		const after = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: () => false, afterTransition: after }],
		);
		const result = await m.goTo("step2", { skipValidation: true });
		expect(result).toBeUndefined(); // goTo stays Promise<void>
		expect(m.snapshot.currentStepId).toBe("step1"); // unchanged
		expect(after).not.toHaveBeenCalled();
	});

	it("beforeTransition throwing aborts the transition, routes to onError, and rethrows", async () => {
		const onError = vi.fn();
		const boom = new Error("veto-throw");
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: () => {
						throw boom;
					},
				},
			],
		);
		m.use({ name: "watch", onError });
		await expect(m.goNext()).rejects.toBe(boom);
		expect(m.snapshot.currentStepId).toBe("step1");
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][1]).toMatchObject({ phase: "transition" });
	});

	it("afterTransition fires after the committed state change", async () => {
		let observed: string | undefined;
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					afterTransition: () => {
						observed = m.snapshot.currentStepId;
					},
				},
			],
		);
		await m.goNext();
		expect(observed).toBe("step2");
	});

	it("before/afterTransition still fire under skipLifecycle", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before, afterTransition: after }],
		);
		await m.goTo("step2", { skipValidation: true, skipLifecycle: true });
		expect(before).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("a throw in afterTransition is isolated; other plugins still run, navigation succeeds", async () => {
		const second = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "a",
					afterTransition: () => {
						throw new Error("after-fail");
					},
				},
				{ name: "b", afterTransition: second },
			],
		);
		await m.goNext();
		expect(m.snapshot.currentStepId).toBe("step2");
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("does not corrupt state when beforeTransition awaits while reset() runs (staleness)", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: async () => {
						await gate;
					},
				},
			],
		);
		const nav = m.goNext();
		m.reset(); // supersede the in-flight transition
		release();
		await nav;
		expect(m.snapshot.currentStepId).toBe("step1"); // reset wins, no corruption
	});

	it("re-entrancy: a plugin calling goNext inside a hook throws busy", async () => {
		let captured: unknown;
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				{
					name: "p",
					beforeTransition: async () => {
						try {
							await m.goNext();
						} catch (e) {
							captured = e;
						}
					},
				},
			],
		);
		await m.goNext();
		expect((captured as { reason?: string })?.reason).toBe("busy");
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins`
Expected: FAIL — `beforeTransition` is never called (machine does not dispatch yet); assertions on `type`/`from`/`to` fail.
- [ ] **Step 3: Implement** (edits to `packages/core/src/machine/wizard-machine.ts`)

4a. Change `navigateToStep` signature + add dispatch. Replace the method (currently L707-764):
```ts
	private async navigateToStep(
		stepId: StepId,
		type: "next" | "previous" | "goTo",
		options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
	): Promise<void> {
		const { pushToHistory = true, skipLifecycle = false } = options ?? {};
		const currentStep = this.currentStep;
		const targetStep = this.definition.steps[stepId];

		// WIZ-007: beforeTransition (sequential, veto/throw aware) at the very top,
		// before onLeave / state write, where both from and to are known.
		const fromStepId = currentStep.id;
		const event = {
			type,
			fromStepId,
			toStepId: stepId,
			data: this.state.data as never,
			timestamp: Date.now(),
		};
		// A beforeTransition throw aborts the transition. Do NOT report it here:
		// it is not a WizardValidationError, so withTransition's catch (Task 5) is
		// the single reporter for it (default phase "transition", stepId =
		// currentStepId, which still equals fromStepId since no state write has
		// happened yet). Just rethrow so withTransition handles + reports it once.
		const proceed = await this.pluginHost.dispatchBeforeTransition(event);
		if (!proceed) {
			// Veto: silent cancel. No leave/enter, no state write, no afterTransition.
			return;
		}
		// A plugin may have awaited while reset()/cancel() interrupted.
		if (this.isTransitionStale()) {
			return;
		}

		// Call onLeave for current step
		if (!skipLifecycle) {
			if (currentStep.onLeave) {
				await currentStep.onLeave(this.state.data, this.context);
			}
			// FIX 2: a reset()/cancel() during onLeave supersedes this transition.
			if (this.isTransitionStale()) {
				return;
			}
			this.events.onStepLeave?.(currentStep.id, this.state.data);
		}

		// Update history stack
		if (pushToHistory) {
			this.stepHistory.push(stepId);
		}

		// Update state.
		const targetStatus =
			this.state.stepStatuses[stepId] === "completed" ? "completed" : "active";
		this.state = {
			...this.state,
			currentStepId: stepId,
			isValid: true,
			validationErrors: undefined,
			canGoBack: this.stepHistory.length > 1,
			stepStatuses: {
				...this.state.stepStatuses,
				[stepId]: targetStatus,
			},
		};

		this.visitedSteps.add(stepId);

		// Call onEnter for new step
		if (!skipLifecycle) {
			if (targetStep.onEnter) {
				await targetStep.onEnter(this.state.data, this.context);
			}
			// FIX 2: a reset()/cancel() during onEnter supersedes this transition.
			if (this.isTransitionStale()) {
				return;
			}
			this.events.onStepEnter?.(stepId, this.state.data);
		}

		this.notifyStateChange();

		// WIZ-007: afterTransition fires ONLY after the committed notifyStateChange
		// (not on any stale early-return above). Isolated per-plugin.
		await this.pluginHost.dispatchAfterTransition(event);
	}
```
> NOTE: `afterTransition` must use the SAME `event` object built at the top; `data` is the live reference (a `DeepReadonly` cast). The early `return`s above ensure a stale-aborted transition fires neither `notifyStateChange` nor `afterTransition`.

4b. Update all `navigateToStep` call sites to pass `type`:
- `goNext` (L471): `await this.navigateToStep(nextStepId, "next");`
- `goPrevious` history branch (L491): `await this.navigateToStep(previousStepId, "previous", { pushToHistory: false });`
- `goPrevious` resolver branch (L505): `await this.navigateToStep(previousStepId, "previous");`
- `goBack` (L557): `await this.navigateToStep(targetStepId, "previous", { pushToHistory: false });`
- `goTo` (L621): `await this.navigateToStep(stepId, "goTo", { skipLifecycle });`
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins` → PASS. Re-run the full suite to confirm no regression in existing navigation tests: `pnpm --filter @gooonzick/wizard-core test`. Then `typecheck`.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/plugins.test.ts && \
git commit -m "feat(core): dispatch before/afterTransition with veto + type (WIZ-007)"
```

---

### Task 5: Machine — extend `handleError(error, phase?, stepId?)` + dispatch plugin `onError`

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`handleError` L1244-1247; call sites: `validate` L362, `submit` L423, `goNext` validation path, `goTo` validation path L598-600, `cancel` L860, `withTransition` L1268, `initializeFirstStep` L191)
- Test: `packages/core/tests/plugins.test.ts`

- [ ] **Step 1: Write the failing test** (append to `packages/core/tests/plugins.test.ts`)
```ts
import { createValidatedDefinition } from "./fixtures";

describe("WizardMachine plugin onError", () => {
	it("dispatches onError on a validation error with phase 'validation'", async () => {
		const onError = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" }, // invalid: name required on step1
			{},
			[{ name: "p", onError }],
		);
		await expect(m.goNext()).rejects.toBeTruthy();
		expect(onError).toHaveBeenCalled();
		const ctx = onError.mock.calls.at(-1)?.[1];
		expect(ctx).toMatchObject({ phase: "validation", stepId: "step1" });
		expect(ctx.data).toBeDefined();
	});

	it("dispatches onError with phase 'validation' when goTo fails current-step validation", async () => {
		const onError = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" }, // invalid: current step1 fails validation
			{},
			[{ name: "p", onError }],
		);
		// goTo validates the CURRENT step before leaving; skipValidation defaults to false.
		await expect(m.goTo("step2")).rejects.toBeTruthy();
		expect(onError).toHaveBeenCalledTimes(1);
		const ctx = onError.mock.calls.at(-1)?.[1];
		expect(ctx).toMatchObject({ phase: "validation", stepId: "step1" });
	});

	it("a throw inside a plugin's onError is swallowed (no recursion)", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const m = new WizardMachine<SimpleData>(
			createValidatedDefinition(),
			{},
			{ name: "", email: "" },
			{},
			[
				{
					name: "p",
					onError: () => {
						throw new Error("inside-onError");
					},
				},
			],
		);
		await expect(m.goNext()).rejects.toBeTruthy();
		// No infinite loop: console.error called a bounded number of times.
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins`
Expected: FAIL — plugin `onError` is never invoked (machine only calls `events.onError`); `ctx.phase` assertion fails.
- [ ] **Step 3: Implement** (edits to `packages/core/src/machine/wizard-machine.ts`)

5a. Replace `handleError` (L1244-1247):
```ts
	/**
	 * Handles errors: wraps non-Errors, fires events.onError (unchanged signature),
	 * then dispatches to plugin onError hooks with an ErrorContext (WIZ-007).
	 */
	private handleError(
		error: unknown,
		phase: ErrorContext<T>["phase"] = "transition",
		stepId?: StepId,
	): void {
		const err = error instanceof Error ? error : new Error(String(error));
		this.events.onError?.(err);
		// WIZ-007: build the ErrorContext and dispatch to plugins (isolated; a
		// throw inside a plugin's onError is swallowed by the host — no recursion).
		const ctx: ErrorContext<T> = {
			stepId: stepId ?? this.state.currentStepId,
			phase,
			data: this.state.data as never,
		};
		void this.pluginHost.dispatchError(err, ctx);
	}
```

5b. Add the `ErrorContext` import to the plugin types import block from Task 3 (3a):
```ts
import type {
	ErrorContext,
	WizardMachineReadonly,
	WizardPlugin,
} from "../plugins/types";
```

5c. Thread `phase` from the call sites that know it:
- `validate` catch (L362): `this.handleError(error, "validation");`
- `submit` catch (L423): `this.handleError(error, "submit");`
- `goNext` — the validation-failure path currently throws `WizardValidationError`, which propagates up to `withTransition`'s catch (the only place a validation error is reported today). To attach the precise `phase: "validation"`, change the `goNext` validation branch (currently L439-442) to report explicitly before throwing:
```ts
			if (!validationResult.valid) {
				this.setStepStatusInternal(this.state.currentStepId, "error");
				const err = new WizardValidationError(validationResult.errors || {});
				this.handleError(err, "validation");
				throw err;
			}
```
- `goTo` — like `goNext`, `goTo` validates the CURRENT step before leaving (real code L595-601: `if (!skipValidation) { const validationResult = await this.validate(); if (!validationResult.valid) { throw new WizardValidationError(...); } }`). Because `withTransition`'s catch now SKIPS every `WizardValidationError` (5d), this throw would reach NO reporting site and plugin `onError` would never fire for a `goTo` validation failure. Mirror `goNext`: report explicitly with `phase: "validation"` before throwing, keeping `goTo`'s `Promise<void>` contract and rethrow semantics unchanged. Change the `goTo` validation branch (currently L598-600) to:
```ts
				if (!validationResult.valid) {
					const err = new WizardValidationError(validationResult.errors || {});
					this.handleError(err, "validation");
					throw err;
				}
```
(`goTo` does not set step status to `"error"` here — preserve its current behavior; only add the report before the throw.)
- `cancel` (L860): `this.handleError(handlerError, "lifecycle");`
- `initializeFirstStep` catch (L191): `this.handleError(error, "lifecycle");`
- The `beforeTransition` throw path in `navigateToStep` (Task 4) deliberately does NOT call `handleError` — it just rethrows, so `withTransition`'s catch is the single reporter (default `phase: "transition"`). This keeps plugin `onError` firing exactly once for that path.

> **Why a double-report could occur (verified against the real code):** `withTransition`'s catch (currently L1267-1269) is the catch-all that wraps every navigation op (`goNext`/`goPrevious`/`goTo`/`goBack`). It calls `this.handleError(error)` then rethrows. The `goNext` validation branch above now reports the `WizardValidationError` with `phase: "validation"` and throws it; that same instance then bubbles into `withTransition`'s catch, which would report it a SECOND time with the default `phase: "transition"` — firing every plugin `onError` twice for one validation failure.

> **Fix (implement this):** keep `handleError` simple (the version in 5a — NO `reportedErrors` WeakSet, NO machine-lifetime de-dupe). Instead, guard `withTransition`'s catch so it does not re-report a `WizardValidationError`, which the navigation method that threw it has already handled (and which already set the step status to `error`). Replace `withTransition`'s catch (currently L1267-1269) with:
```ts
		} catch (error) {
			// A WizardValidationError was already reported (with phase "validation")
			// and its step status set by the navigation method that threw it; do not
			// re-report it here. All other errors are reported with the default phase.
			if (!(error instanceof WizardValidationError)) {
				this.handleError(error);
			}
			throw error;
		} finally {
```
  (`WizardValidationError` is already imported at the top of `wizard-machine.ts`.)
>
> **RATIONALE:** this routes each distinct error to plugin `onError` exactly once with the most specific phase, and keeps the rethrow semantics unchanged. Validation failures inside `goNext`/`goTo` are reported once by the explicit `handleError(..., "validation")` call and then SKIPPED by `withTransition`'s `instanceof WizardValidationError` guard. Every non-validation error — a `beforeTransition` throw, an `onLeave`/`onEnter`/`onSubmit` throw, a `WizardNavigationError`, etc. — is NOT a `WizardValidationError`, so the guard does not skip it; it is reported exactly once, by `withTransition`'s catch, with the default `phase: "transition"`. Crucially, the `beforeTransition`-throw path (Task 4) does NOT call `handleError` itself — it just rethrows — so `withTransition` is its single reporter. This is why no machine-lifetime de-dupe set is needed: each error has exactly one reporting site by construction, with nothing to leak.
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins` → PASS. Run full suite + typecheck.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/plugins.test.ts && \
git commit -m "feat(core): extend handleError with phase + dispatch plugin onError (WIZ-007)"
```

---

### Task 6: Machine — dispatch `onComplete` in `complete()`, `onReset` in `reset()`

**Files:**
- Modify: `packages/core/src/machine/wizard-machine.ts` (`complete` L868-884; `reset` L799-827)
- Test: `packages/core/tests/plugins.test.ts`

- [ ] **Step 1: Write the failing test** (append to `packages/core/tests/plugins.test.ts`)
```ts
describe("WizardMachine onComplete / onReset boundaries", () => {
	it("fires onComplete (not before/afterTransition) on completion", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const onComplete = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before, afterTransition: after, onComplete }],
		);
		await m.goNext(); // step1 -> step2
		await m.goNext(); // step2 -> step3
		await m.goNext(); // step3 -> complete
		expect(m.snapshot.isCompleted).toBe(true);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith(
			expect.objectContaining({ name: "a" }),
		);
		// 2 real transitions fired before/after; the final goNext completes.
		expect(before).toHaveBeenCalledTimes(2);
		expect(after).toHaveBeenCalledTimes(2);
	});

	it("fires onReset (not before/afterTransition) on reset() and cancel()", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const onReset = vi.fn();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[{ name: "p", beforeTransition: before, afterTransition: after, onReset }],
		);
		await m.goNext();
		before.mockClear();
		after.mockClear();
		m.reset();
		await m.cancel();
		await flush();
		expect(onReset).toHaveBeenCalledTimes(2); // reset + cancel(->reset)
		expect(before).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins`
Expected: FAIL — `onComplete`/`onReset` plugin hooks never invoked.
- [ ] **Step 3: Implement** (edits to `packages/core/src/machine/wizard-machine.ts`)

6a. In `complete()` after `this.notifyStateChange();` (L883):
```ts
		this.notifyStateChange();

		// WIZ-007: dispatch plugin onComplete (isolated), after definition/events.
		void this.pluginHost.dispatchComplete(this.state.data);
	}
```

6b. In `reset()` after `this.events.onReset?.();` (L822):
```ts
		this.notifyStateChange();
		this.events.onReset?.();
		// WIZ-007: dispatch plugin onReset (isolated). Fires for reset() and, via
		// cancel()'s implicit reset, for cancel() too.
		void this.pluginHost.dispatchReset();
		this.debug(`Wizard reset to initial step: ${initialStepId}`);
```
> **IMPORTANT — do NOT double-dispatch `onReset`:** plugin `onReset` is dispatched ONLY here, inside `reset()`. `cancel()` calls `reset()` internally, so it inherits the `onReset` dispatch automatically. Do NOT add a second `void this.pluginHost.dispatchReset()` (or any `onReset` dispatch) inside `cancel()`. The Task 6 test asserts `onReset` is called exactly twice for an explicit `reset()` + a `cancel()` — adding a dispatch in `cancel()` would make `cancel()` fire it twice (count 3) and break the test.
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins` → PASS. Full suite + typecheck.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/machine/wizard-machine.ts packages/core/tests/plugins.test.ts && \
git commit -m "feat(core): dispatch plugin onComplete/onReset (WIZ-007)"
```

---

### Task 7: `createLoggingPlugin` reference plugin

**Files:**
- Create: `packages/core/src/plugins/logging.ts`
- Test: `packages/core/tests/logging-plugin.test.ts`

- [ ] **Step 1: Write the failing test** (create `packages/core/tests/logging-plugin.test.ts`)
```ts
import { describe, expect, it, vi } from "vitest";
import { createLoggingPlugin } from "../src/plugins/logging";
import type { TransitionEvent } from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const fakeLogger = () => ({
	log: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
});

const ev = (): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
});

describe("createLoggingPlugin", () => {
	it("logs init/transition/complete/reset/destroy via the injected logger", async () => {
		const logger = fakeLogger();
		const plugin = createLoggingPlugin<D>({ logger });
		plugin.onInit?.({
			snapshot: { currentStepId: "a" } as never,
			currentStep: { id: "a" } as never,
			getStepStatus: () => "active",
		});
		await plugin.beforeTransition?.(ev());
		await plugin.afterTransition?.(ev());
		await plugin.onComplete?.({ value: 1 });
		await plugin.onReset?.();
		await plugin.destroy?.();
		// Default level "debug" → uses logger.debug for verbose lines.
		expect(logger.debug).toHaveBeenCalled();
		// afterTransition logs "from -> to"
		const messages = logger.debug.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => m.includes("a") && m.includes("b"))).toBe(true);
	});

	it("never vetoes and never throws", async () => {
		const plugin = createLoggingPlugin<D>({ logger: fakeLogger() });
		const result = await plugin.beforeTransition?.(ev());
		expect(result).not.toBe(false); // does not veto
	});

	it("respects level: 'warn' uses logger.warn for errors, suppresses debug lines", async () => {
		const logger = fakeLogger();
		const plugin = createLoggingPlugin<D>({ level: "warn", logger });
		await plugin.beforeTransition?.(ev()); // debug-level line, suppressed at "warn"
		await plugin.onError?.(new Error("boom"), {
			stepId: "a",
			phase: "transition",
			data: { value: 1 },
		});
		expect(logger.debug).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalled();
	});

	it("defaults to console when no logger is provided", () => {
		const plugin = createLoggingPlugin<D>();
		expect(plugin.name).toBe("logging");
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- logging-plugin`
Expected: FAIL — `Cannot find module '../src/plugins/logging'`.
- [ ] **Step 3: Implement** (create `packages/core/src/plugins/logging.ts`)
```ts
import type { WizardError } from "../errors";
import type {
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";

type LogLevel = "debug" | "info" | "warn";
type Logger = Pick<Console, "log" | "warn" | "debug">;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2 };

/**
 * Reference plugin: a pure observer that logs every hook. Never vetoes, never
 * throws. Doubles as the canonical "how to write a plugin" example.
 */
export function createLoggingPlugin<TData>(config?: {
	level?: LogLevel;
	logger?: Logger;
}): WizardPlugin<TData> {
	const level: LogLevel = config?.level ?? "debug";
	const logger: Logger = config?.logger ?? console;
	const threshold = LEVEL_RANK[level];

	// Verbose lines are emitted at "debug"; suppressed when the configured level
	// is higher than "debug".
	const verbose = (message: string): void => {
		if (threshold <= LEVEL_RANK.debug) {
			logger.debug(message);
		}
	};

	return {
		name: "logging",
		onInit(machine: WizardMachineReadonly<TData>): void {
			verbose(
				`[wizard:logging] init @ step "${machine.snapshot.currentStepId}"`,
			);
		},
		beforeTransition(e: TransitionEvent<TData>): void {
			verbose(
				`[wizard:logging] beforeTransition (${e.type}) ${e.fromStepId} -> ${e.toStepId}`,
			);
		},
		afterTransition(e: TransitionEvent<TData>): void {
			verbose(
				`[wizard:logging] afterTransition (${e.type}) ${e.fromStepId} -> ${e.toStepId}`,
			);
		},
		onComplete(): void {
			verbose("[wizard:logging] complete");
		},
		onReset(): void {
			verbose("[wizard:logging] reset");
		},
		onError(error: WizardError | Error, ctx: ErrorContext<TData>): void {
			// Errors are always surfaced at warn level.
			logger.warn(
				`[wizard:logging] error in phase "${ctx.phase}" @ step "${ctx.stepId}": ${error.message}`,
			);
		},
		destroy(): void {
			verbose("[wizard:logging] destroy");
		},
	};
}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-core test -- logging-plugin` → PASS. Typecheck.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/plugins/logging.ts packages/core/tests/logging-plugin.test.ts && \
git commit -m "feat(core): add createLoggingPlugin reference plugin (WIZ-007)"
```

---

### Task 8: Subpath barrel + `./plugins` export + multi-entry build + main barrel re-exports

**Files:**
- Create: `packages/core/src/plugins/index.ts`
- Modify: `packages/core/src/index.ts` (append at the end; currently 79 lines)
- Modify: `packages/core/package.json` (`exports` L13-18)
- Modify: `packages/core/vite.config.ts` (lib `entry` L13-18)
- Test: `packages/core/tests/plugins-barrel.test.ts` + build verification

- [ ] **Step 1: Write the failing test** (create `packages/core/tests/plugins-barrel.test.ts`)
```ts
import { describe, expect, it } from "vitest";

describe("plugin barrels", () => {
	it("exposes plugin public API from the subpath barrel (src)", async () => {
		const mod = await import("../src/plugins/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
	});

	it("re-exports createLoggingPlugin from the main barrel", async () => {
		const mod = await import("../src/index");
		expect(typeof mod.createLoggingPlugin).toBe("function");
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins-barrel`
Expected: FAIL — `Cannot find module '../src/plugins/index'` and `mod.createLoggingPlugin` is `undefined` from main barrel.
- [ ] **Step 3: Implement**

8a. Create `packages/core/src/plugins/index.ts`:
```ts
export { createLoggingPlugin } from "./logging";
export type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";
```

8b. Append at the end of `packages/core/src/index.ts` (currently 79 lines, after the transition-types block):
```ts
// Plugins (WIZ-007)
export { createLoggingPlugin } from "./plugins/logging";
export type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./plugins/types";
```

8c. Replace `exports` in `packages/core/package.json` (L13-18):
```json
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.js"
		},
		"./plugins": {
			"types": "./dist/plugins.d.ts",
			"import": "./dist/plugins.js"
		}
	},
```

8d. Replace the `lib` block in `packages/core/vite.config.ts` (L12-20):
```ts
	build: {
		lib: {
			entry: {
				index: "./src/index.ts",
				plugins: "./src/plugins/index.ts",
			},
			name: "WizardCore",
			formats: ["es"],
		},
		outDir: "./dist",
	},
```
> With multi-entry `entry` as an object, Vite emits `dist/index.js` and `dist/plugins.js` (entry key becomes the file name; drop the single `fileName`). `vite-plugin-dts` (already configured with `include: ["src"]`) emits `dist/index.d.ts` and `dist/plugins.d.ts` automatically for both entry points.
- [ ] **Step 4: Run test to verify it passes + build verification**
Run: `pnpm --filter @gooonzick/wizard-core test -- plugins-barrel` → PASS.
Then verify the real build emits both entries and the subpath import resolves:
```bash
pnpm --filter @gooonzick/wizard-core build
ls packages/core/dist/index.js packages/core/dist/plugins.js \
   packages/core/dist/index.d.ts packages/core/dist/plugins.d.ts
node --input-type=module -e "import('@gooonzick/wizard-core/plugins').then(m => { if (typeof m.createLoggingPlugin !== 'function') process.exit(1); console.log('subpath OK'); })"
```
Expected: all four files listed; node prints `subpath OK`.
- [ ] **Step 5: Commit**
```bash
git add packages/core/src/plugins/index.ts packages/core/src/index.ts \
        packages/core/package.json packages/core/vite.config.ts \
        packages/core/tests/plugins-barrel.test.ts && \
git commit -m "feat(core): add ./plugins subpath export and multi-entry build (WIZ-007)"
```

---

### Task 9: State manager `destroy()`

**Files:**
- Modify: `packages/state/src/manager.ts` (add method near `getMachine` L345-347)
- Test: `packages/state/tests/manager-destroy.test.ts`

- [ ] **Step 1: Write the failing test** (create `packages/state/tests/manager-destroy.test.ts`)
```ts
import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

interface D extends Record<string, unknown> {
	name: string;
}

const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("WizardStateManager.destroy", () => {
	it("calls machine.destroy() so plugin destroy hooks run (reverse order)", async () => {
		const order: string[] = [];
		const machine = new WizardMachine<D>(def, {}, { name: "" }, {}, [
			{ name: "a", destroy: () => void order.push("a") },
			{ name: "b", destroy: () => void order.push("b") },
		]);
		const manager = new WizardStateManager(machine, def.initialStepId);
		await manager.destroy();
		expect(order).toEqual(["b", "a"]);
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core build && pnpm --filter @gooonzick/wizard-state test -- manager-destroy`
Expected: FAIL — `manager.destroy is not a function`.
- [ ] **Step 3: Implement** (add to `packages/state/src/manager.ts`, after `getMachine()` L347)
```ts
	/**
	 * Tears down the wizard: delegates to the machine's destroy(), which runs
	 * every plugin's destroy() hook in reverse registration order. The machine
	 * isolates plugin-destroy rejections internally (routed to onError /
	 * console.error), so callers may fire-and-forget the returned promise.
	 */
	async destroy(): Promise<void> {
		await this.machine.destroy();
	}
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-state test -- manager-destroy` → PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/state/src/manager.ts packages/state/tests/manager-destroy.test.ts && \
git commit -m "feat(state): add WizardStateManager.destroy() (WIZ-007)"
```

---

### Task 10: React — `plugins` option + destroy-on-unmount

**Files:**
- Modify: `packages/react/src/use-wizard.tsx` (`UseWizardOptions` L26-37; destructure L152-163; `createManager` `new WizardMachine` L240-245; add `useEffect`)
- Modify: `packages/react/src/wizard-provider.tsx` (`WizardProviderProps` L31-43; destructure L49-60; `new WizardMachine` L128-133; add `useEffect`)
- Test: `packages/react/tests/plugins.test.tsx`

- [ ] **Step 1: Write the failing test** (create `packages/react/tests/plugins.test.tsx`)
```tsx
import { createLinearWizard } from "@gooonzick/wizard-core";
import type { WizardPlugin } from "@gooonzick/wizard-core";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";
import { WizardProvider } from "../src/wizard-provider";

interface D extends Record<string, unknown> {
	name: string;
}

const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("React plugins option", () => {
	it("threads plugins into the machine (onInit fires) via useWizard", async () => {
		const onInit = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", onInit }];
		const Comp = () => {
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
			return <div>ok</div>;
		};
		render(<Comp />);
		await new Promise((r) => setTimeout(r, 0));
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (useWizard)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const Comp = () => {
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
			return <div>ok</div>;
		};
		const { unmount } = render(<Comp />);
		unmount();
		await new Promise((r) => setTimeout(r, 0));
		expect(destroy).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (WizardProvider)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const { unmount } = render(
			<WizardProvider definition={def} initialData={{ name: "" }} plugins={plugins}>
				<div>child</div>
			</WizardProvider>,
		);
		unmount();
		await new Promise((r) => setTimeout(r, 0));
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core build && pnpm --filter @gooonzick/wizard-react test -- plugins`
Expected: FAIL — `plugins` not accepted by options/props; `onInit`/`destroy` never called.
- [ ] **Step 3: Implement**

10a. `packages/react/src/use-wizard.tsx`:
- Add to imports (L1-13): `WizardPlugin` to the type import from `@gooonzick/wizard-core`, and `useEffect` to the react import (L15-21).
- Add to `UseWizardOptions` (after `onError?` L36):
```ts
	/**
	 * Plugins registered once at machine creation (reference-stable — read once,
	 * NOT reactive). Define them outside render or memoize them.
	 */
	plugins?: WizardPlugin<T>[];
```
- Destructure `plugins` (in the `const { ... } = options;` block L152-163): add `plugins,`.
- Store it in a ref alongside the others (after `const definitionRef = useRef(definition);` L190): `const pluginsRef = useRef(plugins);`
- Pass as 5th arg in `createManager`'s `new WizardMachine(...)` (L240-245):
```ts
			const machine = new WizardMachine(
				definitionRef.current,
				contextRef.current,
				data,
				events,
				pluginsRef.current,
			);
```
- Add a destroy-on-unmount effect (after the `const [manager] = useState(...)` block, ~L260):
```ts
	// WIZ-007: tear down plugins on unmount. Cleanup must be synchronous; we
	// deliberately do NOT await the Promise<void> (destroy isolates its own
	// rejections internally).
	useEffect(() => {
		return () => {
			void manager.destroy();
		};
	}, [manager]);
```

10b. `packages/react/src/wizard-provider.tsx`:
- Add `WizardPlugin` to the type import (L1-7) and `useEffect` to the react import (L10-16).
- Add to `WizardProviderProps` (after `onError?` L41): the same `plugins?: WizardPlugin<T>[];` field (with the same doc comment).
- Destructure `plugins` in the function params (L49-61): add `plugins,` before `children,`.
- Store in a ref (after `const definitionRef = useRef(definition);` L87): `const pluginsRef = useRef(plugins);`
- Pass as 5th arg to `new WizardMachine(...)` (L128-133):
```ts
		const machine = new WizardMachine(
			definitionRef.current,
			contextRef.current,
			initialDataRef.current,
			events,
			pluginsRef.current,
		);
```
- Add the destroy effect (after the `if (!managerRef.current) { ... }` block, before the `contextValue` useMemo L142):
```ts
	useEffect(() => {
		const manager = managerRef.current;
		return () => {
			void manager?.destroy();
		};
	}, []);
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-react test -- plugins` → PASS. Run the full react suite to confirm no regression: `pnpm --filter @gooonzick/wizard-react test`. Typecheck: `pnpm --filter @gooonzick/wizard-react typecheck`.
- [ ] **Step 5: Commit**
```bash
git add packages/react/src/use-wizard.tsx packages/react/src/wizard-provider.tsx \
        packages/react/tests/plugins.test.tsx && \
git commit -m "feat(react): thread plugins option + destroy on unmount (WIZ-007)"
```

---

### Task 11: Vue — `plugins` option + destroy in existing `onScopeDispose`

**Files:**
- Modify: `packages/vue/src/types.ts` (`UseWizardOptions`)
- Modify: `packages/vue/src/use-wizard.ts` (destructure L35-46; `createMachine` `new WizardMachine` L65-66; existing `onScopeDispose` L178-181)
- Modify: `packages/vue/src/wizard-provider.ts` (`WizardProviderProps` L37-48; `props` block L55-85; `useWizard({...})` call L89-100)
- Test: `packages/vue/tests/plugins.test.ts`

> NOTE: `packages/vue/src/wizard-provider.ts` calls `useWizard` internally (it does NOT call `new WizardMachine` directly). The Vue `WizardProvider` IS public API and forwards its props into `useWizard`, so — mirroring the React task which adds `plugins` to BOTH `use-wizard` and `wizard-provider` — the Vue provider gains a `plugins` prop that is threaded into its internal `useWizard(...)` call (matching how it forwards `onComplete`/`onError`/etc.). The Vue machine construction itself lives only in `use-wizard.ts`; the provider just forwards the option.

- [ ] **Step 1: Write the failing test** (create `packages/vue/tests/plugins.test.ts`)
```ts
import { createLinearWizard } from "@gooonzick/wizard-core";
import type { WizardPlugin } from "@gooonzick/wizard-core";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useWizard } from "../src/use-wizard";

interface D extends Record<string, unknown> {
	name: string;
}

const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Vue plugins option", () => {
	it("threads plugins into the machine (onInit fires)", async () => {
		const onInit = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", onInit }];
		const Comp = defineComponent({
			setup() {
				useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
				return () => null;
			},
		});
		mount(Comp);
		await flush();
		expect(onInit).toHaveBeenCalledTimes(1);
	});

	it("calls plugin destroy on unmount (onScopeDispose)", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<D>[] = [{ name: "p", destroy }];
		const Comp = defineComponent({
			setup() {
				useWizard<D>({ definition: def, initialData: { name: "" }, plugins });
				return () => null;
			},
		});
		const wrapper = mount(Comp);
		wrapper.unmount();
		await flush();
		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
```
- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @gooonzick/wizard-core build && pnpm --filter @gooonzick/wizard-vue test -- plugins`
Expected: FAIL — `plugins` not accepted; `onInit`/`destroy` never called.
- [ ] **Step 3: Implement**

11a. `packages/vue/src/types.ts` — add `plugins?: WizardPlugin<T>[];` to `UseWizardOptions<T>` (and import the type from `@gooonzick/wizard-core`). Inspect the existing `UseWizardOptions` shape there; mirror the React doc comment:
```ts
	/**
	 * Plugins registered once at machine creation (reference-stable — read once,
	 * NOT reactive). Define them outside setup or hoist them.
	 */
	plugins?: WizardPlugin<T>[];
```

11b. `packages/vue/src/use-wizard.ts`:
- Add `WizardPlugin` to the type import (L1-7).
- Destructure `plugins` (L35-46 block): add `plugins,`.
- Pass as the 5th arg in `createMachine` (L65-103). Change:
```ts
		return new WizardMachine(definition, context, data || initialData, {
			...
		});
```
to add `, plugins` after the events object:
```ts
		return new WizardMachine(
			definition,
			context,
			data || initialData,
			{
				onStateChange: (newState: WizardState<T>) => { /* unchanged */ },
				/* ...all existing event handlers unchanged... */
			},
			plugins,
		);
```
- Add `manager.destroy()` into the EXISTING `onScopeDispose` block (L178-181):
```ts
	onScopeDispose(() => {
		stopStepWatcher();
		unsubscribeNavigation();
		// WIZ-007: tear down plugins (machine.destroy via the manager). Isolated
		// rejections are handled internally — fire-and-forget here.
		void manager.value.destroy();
	});
```

11c. `packages/vue/src/wizard-provider.ts` — add a `plugins` prop and forward it (mirrors the React provider):
- Add `WizardPlugin` to the type import (L1-7, from `@gooonzick/wizard-core`).
- Add to `WizardProviderProps<T>` (after `onError?` L47): `plugins?: WizardPlugin<T>[];`.
- Add to the `props` block (after the `onError:` entry L84):
```ts
		plugins: Array as unknown as () => WizardPlugin<WizardData>[],
```
- Forward it into the internal `useWizard({...})` call (after `onError: props.onError,` L99):
```ts
			plugins: props.plugins,
```
- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @gooonzick/wizard-vue test -- plugins` → PASS. Full vue suite + typecheck.
- [ ] **Step 5: Commit**
```bash
git add packages/vue/src/types.ts packages/vue/src/use-wizard.ts \
        packages/vue/src/wizard-provider.ts packages/vue/tests/plugins.test.ts && \
git commit -m "feat(vue): thread plugins option + destroy on scope dispose (WIZ-007)"
```

---

### Task 12: Documentation

**Files:**
- Create: `packages/docs/guide/plugins.md`
- Modify: `packages/docs/.vitepress/config.ts` (sidebar `/guide/` Guide items L33-38)
- Modify: `packages/docs/guide/api/core.md` (under `## WizardMachine` L394+)
- Modify: `docs/api-reference.md` (after `### WizardMachine` section, before `### Builders` L550)
- Modify: `docs/core-concepts.md` (new section after `## 12. Step Status Tracking`)
- Modify: `docs/ROADMAP.md` (L16-35 table, L65 matrix row, L484-605 WIZ-007 block, WIZ-010 L772)

This task is **doc-only** — no failing test. Acceptable per the plan. Verify by building docs.

- [ ] **Step 1: Create `packages/docs/guide/plugins.md`**
```markdown
# Plugins

Plugins let you intercept wizard transitions and lifecycle events globally,
across every step — ideal for analytics, auto-save, logging, and error
reporting. A plugin is a plain object implementing the `WizardPlugin` interface;
you register instances on the machine.

> `onDataChange` is **not** part of the plugin interface yet — it is deferred to
> WIZ-010 and will be added without a breaking change.

## The `WizardPlugin` interface

\`\`\`ts
interface WizardPlugin<TData = unknown> {
  name: string;                       // unique; used by removePlugin
  onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;
  beforeTransition?(e: TransitionEvent<TData>): boolean | void | Promise<boolean | void>;
  afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;
  onError?(error: WizardError | Error, ctx: ErrorContext<TData>): void | Promise<void>;
  onComplete?(data: DeepReadonly<TData>): void | Promise<void>;
  onReset?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}
\`\`\`

Hook payloads (`data`, `snapshot`, `currentStep`) are typed `DeepReadonly<T>`:
TypeScript prevents mutation at compile time. These are the machine's **live
references** (no cloning) — never mutate them.

## Registering plugins

\`\`\`ts
const machine = new WizardMachine(definition, context, initialData, events, [
  createLoggingPlugin({ level: "debug" }),
]);

// Or register later (chainable):
machine.use(createLoggingPlugin()).use(myPlugin);

// Remove by name (runs that plugin's destroy()):
await machine.removePlugin("logging");

// Tear down all plugins (reverse registration order):
await machine.destroy();
\`\`\`

`use()` throws `WizardConfigurationError` on a duplicate `name`. Construction and
`use()` stay synchronous: `onInit` is fire-and-forget (not awaited), so other
hooks may fire before a slow async `onInit` resolves — gate your own readiness
internally if you need async setup.

## Hook reference & firing order

| Hook | When | Can veto? | Isolation |
| --- | --- | --- | --- |
| `onInit` | After initial state seeding / immediately on late `use()` | No | Fire-and-forget; rejection → `onError` |
| `beforeTransition` | Top of every step change (`goNext`/`goPrevious`/`goTo`) | **Yes** (`return false`) | Sequential; a throw aborts + rethrows |
| `afterTransition` | After the committed state change + `onStateChange` | No | Isolated (throw → `onError`, others run) |
| `onComplete` | In `complete()`, after definition/events `onComplete` | No | Isolated |
| `onReset` | In `reset()` (and `cancel()`'s reset) | No | Isolated |
| `onError` | Inside `handleError` after `events.onError` | No | Isolated; throw swallowed (no recursion) |
| `destroy` | `removePlugin()` / `machine.destroy()` | No | Reverse order, isolated |

Order for a normal `goNext` step change:

\`\`\`
validate -> onSubmit -> status=completed -> resolveNext
  -> navigateToStep:
       beforeTransition (sequential, veto/throw aware)
       [staleness check]
       onLeave -> push history -> write state -> onEnter
       notifyStateChange
       afterTransition (isolated)
\`\`\`

### Veto semantics

A `beforeTransition` returning `false` is a **silent cancel**: no leave/enter, no
state write, no `onStateChange`, no `afterTransition`. The nav method resolves as
a no-op — `goTo` still returns `Promise<void>` (no return-type change). To surface
a reason, set state / log yourself, or `throw` to escalate to an error.

### Error semantics

A throw in `beforeTransition` aborts the transition (like a veto) **and** routes
through `onError` with `phase: "transition"`, then rethrows from the nav method.
A throw in any other hook (`afterTransition`, `onComplete`, `onReset`, `onInit`,
`destroy`) is caught, routed to `onError`, and never crashes the wizard or stops
the remaining plugins. A throw **inside** `onError` is swallowed (at most
`console.error`) — never re-routed (prevents infinite loops).

### `skipLifecycle` rule

`beforeTransition`/`afterTransition` fire on every actual step change, **including**
`goTo(stepId, { skipLifecycle: true })`. They do **not** fire on completion,
`reset()`, or `cancel()` (those fire `onComplete` / `onReset` instead).

### Re-entrancy

Hooks run inside the transition critical section. A plugin that calls
`goNext`/`goPrevious`/`goTo` synchronously inside a hook hits the busy guard and
throws `WizardNavigationError(reason: "busy")`. Defer navigation (e.g. a
microtask) if a hook needs to navigate.

## React / Vue usage

Plugins are reference-stable (read once at machine creation), NOT reactive —
define them outside render/setup or memoize them.

\`\`\`tsx
// React
const plugins = useMemo(() => [createLoggingPlugin()], []);
useWizard({ definition, initialData, plugins });
\`\`\`

\`\`\`ts
// Vue
const plugins = [createLoggingPlugin()];
useWizard({ definition, initialData, plugins });
\`\`\`

Both integrations tear plugins down automatically on unmount / scope dispose.

## `createLoggingPlugin`

\`\`\`ts
import { createLoggingPlugin } from "@gooonzick/wizard-core/plugins";
// also re-exported from "@gooonzick/wizard-core"

createLoggingPlugin({
  level: "debug",          // "debug" | "info" | "warn"  (default "debug")
  logger: console,         // Pick<Console, "log" | "warn" | "debug">
});
\`\`\`

It implements every hook as a pure observer — logs `from -> to` on transitions
and init/complete/reset/destroy/error events. It never vetoes and never throws.

## Writing your own plugin

\`\`\`ts
import type { WizardPlugin } from "@gooonzick/wizard-core";

export function createStepTimerPlugin<TData>(): WizardPlugin<TData> {
  let enteredAt = 0;
  return {
    name: "step-timer",
    beforeTransition() {
      const elapsed = Date.now() - enteredAt;
      console.log(\`step took \${elapsed}ms\`);
    },
    afterTransition() {
      enteredAt = Date.now();
    },
  };
}
\`\`\`

Keep hooks fast and non-throwing where possible; use `name` uniquely; do async
setup behind your own readiness gate (since `onInit` is not awaited).
```
> When writing the file, the fenced code blocks above use `\`\`\`` placeholders — emit real triple-backtick fences.

- [ ] **Step 2: Register in the VitePress sidebar** (`packages/docs/.vitepress/config.ts`, the `/guide/` → "Guide" items L33-38). Add a Plugins entry after "Defining Wizards":
```ts
				items: [
					{ text: "Getting Started", link: "/guide/getting-started" },
					{ text: "Core Concepts", link: "/guide/core-concepts" },
					{ text: "Defining Wizards", link: "/guide/defining-wizards" },
					{ text: "Plugins", link: "/guide/plugins" },
				],
```

- [ ] **Step 3: Update `packages/docs/guide/api/core.md`** — under `## WizardMachine` (L394+), after the Constructor section (L446-456) add the new optional 5th constructor arg and a `### Plugins` subsection documenting `use(plugin): this`, `removePlugin(name): Promise<void>`, `destroy(): Promise<void>`, and the `WizardPlugin` / `TransitionEvent` / `ErrorContext` / `WizardMachineReadonly` / `DeepReadonly` types (link to `/guide/plugins` for full semantics). Match the existing heading style (`###` for members).

- [ ] **Step 4: Update root `docs/api-reference.md`** — add a `### Plugins / Middleware` section after the `### WizardMachine` block (before `### Builders` ~L550) covering the `WizardPlugin` interface, the constructor `plugins` arg, `use`/`removePlugin`/`destroy`, hook firing order, veto/error semantics, and `createLoggingPlugin` (+ the `@gooonzick/wizard-core/plugins` subpath). Mirror the guide content concisely.

- [ ] **Step 5: Update root `docs/core-concepts.md`** — add a new section after `## 12. Step Status Tracking` (heading e.g. `## 13. Plugins`) with a 1-2 paragraph conceptual mention and a pointer to the guide page.

- [ ] **Step 6: Update `docs/ROADMAP.md`:**
  - Heading L484: `#### WIZ-007: Middleware / Plugin System ✅`
  - "What is Already Implemented" table (after L35): add row
    `| Middleware / Plugin System (WIZ-007)                  | ✅     | core, react, vue, state |`
  - Competitor matrix "Middleware / plugins" row (L65): change `gooonzick/wizard` cell from `❌` to `✅`.
  - Rewrite the WIZ-007 API block (L498-560) to match the shipped API: machine-level `use(plugin): this` + `removePlugin(name): Promise<void>` + `destroy(): Promise<void>`, the constructor `plugins?` 5th arg and the React/Vue `plugins` option. Remove the builder `.use()` example and the `onDataChange` hook from the interface. Keep `TransitionEvent`/`ErrorContext`, but note payloads are `DeepReadonly`. Keep the "Built-in Plugins (future separate packages)" note pointing to WIZ-016, and note `createLoggingPlugin` shipped via `@gooonzick/wizard-core/plugins`.
  - Under WIZ-010 (L772): add a note that WIZ-010 should extend the plugin API with `onDataChange(prevData, nextData)` (additive, non-breaking).

- [ ] **Step 7: Verify docs build**
Run: `pnpm docs:build`
Expected: VitePress build succeeds with no dead-link errors for `/guide/plugins`.
- [ ] **Step 8: Commit**
```bash
git add packages/docs/guide/plugins.md packages/docs/.vitepress/config.ts \
        packages/docs/guide/api/core.md docs/api-reference.md \
        docs/core-concepts.md docs/ROADMAP.md && \
git commit -m "docs: document plugin system + mark WIZ-007 shipped (WIZ-007)"
```

---

### Task 13: Changeset

**Files:**
- Create: `.changeset/wiz-007-plugin-system.md`

The `.changeset/config.json` `fixed` group bumps core/react/vue/state together, so one changeset listing all four (or even just one) bumps the whole group. List all four explicitly to match the prior feature changeset style.

- [ ] **Step 1: Create `.changeset/wiz-007-plugin-system.md`**
```markdown
---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-vue": minor
---

feat: add a plugin system (WIZ-007)

Add runtime plugins to `WizardMachine` with global hooks: `onInit`,
`beforeTransition` (veto-capable), `afterTransition`, `onError`, `onComplete`,
`onReset`, and `destroy`. Register plugins via the new constructor `plugins`
argument or `machine.use(plugin)` (chainable; `removePlugin(name)` and
`machine.destroy()` for teardown in reverse order).

- A new `PluginHost` owns plugin dispatch; `beforeTransition` is awaited
  sequentially and can veto a transition by returning `false` (silent no-op —
  `goTo` still returns `Promise<void>`). Post-transition/lifecycle hooks are
  isolated: a throw routes to `onError` without stopping other plugins.
- Hook payloads are typed `DeepReadonly<T>` (compile-time immutability; no
  runtime clones).
- Ships a reference `createLoggingPlugin`, exported from
  `@gooonzick/wizard-core` and the new `@gooonzick/wizard-core/plugins` subpath.
- React (`useWizard`/`WizardProvider`) and Vue (`useWizard`) gain a `plugins`
  option and tear plugins down on unmount / scope dispose via the new
  `WizardStateManager.destroy()`.

`onDataChange` is intentionally deferred to WIZ-010 (will be added without a
breaking change). Built-in analytics/auto-save plugins remain future work.
```
- [ ] **Step 2: Verify the changeset is valid**
Run: `pnpm changeset status`
Expected: shows the four packages bumping `minor` (no errors).
- [ ] **Step 3: Commit**
```bash
git add .changeset/wiz-007-plugin-system.md && \
git commit -m "chore: add changeset for WIZ-007 plugin system"
```

---

## Final verification (run before opening a PR)

- [ ] `pnpm --filter @gooonzick/wizard-core test` → all green (incl. `plugins`, `plugin-host`, `logging-plugin`, `plugins-barrel`).
- [ ] `pnpm --filter @gooonzick/wizard-core build` → emits `dist/{index,plugins}.{js,d.ts}`.
- [ ] `pnpm --filter @gooonzick/wizard-state test` → green.
- [ ] `pnpm --filter @gooonzick/wizard-react test` → green.
- [ ] `pnpm --filter @gooonzick/wizard-vue test` → green.
- [ ] `pnpm typecheck` → green across the monorepo.
- [ ] `pnpm lint` (Biome) → clean.
- [ ] `pnpm docs:build` → succeeds.
- [ ] `pnpm changeset status` → 4 packages minor.
