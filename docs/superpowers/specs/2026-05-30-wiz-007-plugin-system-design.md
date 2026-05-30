# WIZ-007 — Middleware / Plugin System — Design Spec

**Status:** Approved (brainstorming)
**Date:** 2026-05-30
**Package(s):** `@gooonzick/wizard-core` (primary), `@gooonzick/wizard-state`, `@gooonzick/wizard-react`, `@gooonzick/wizard-vue`
**Release:** Minor, additive (non-breaking)

## 1. Context & Goals

Cross-cutting concerns — analytics, auto-save, logging, error reporting — currently have to be implemented through per-step lifecycle hooks. There is no centralized way to intercept transitions across the whole wizard.

WIZ-007 adds a **plugin system**: runtime plugin instances registered on the `WizardMachine`, with global hooks at machine-level transition and lifecycle points. This ticket delivers the **infrastructure plus one reference plugin** (`createLoggingPlugin`). Built-in analytics/auto-save plugins remain future work (WIZ-016 / separate packages).

### Scope decisions (from brainstorming)

- **Infrastructure + a single `createLoggingPlugin` reference plugin.** No analytics/auto-save in this ticket.
- **Registration model:** plugins are runtime instances on the machine (`machine.use()`), surfaced to React/Vue via a `plugins` option that threads through the `@gooonzick/wizard-state` manager into the machine constructor. The `WizardDefinition` stays pure data — no builder `.use()`.
- **`onDataChange` is deferred to WIZ-010.** It is intentionally omitted from the plugin interface in this ticket and will be added (non-breaking) when WIZ-010 lands.

## 2. Current State (relevant existing architecture)

- `WizardMachine` (`packages/core/src/machine/wizard-machine.ts`) takes `(definition, context, initialData, events?: WizardEvents<T>)`. Callbacks live in `WizardEvents` (`onStateChange`, `onStepEnter`, `onStepLeave`, `onValidation`, `onSubmit`, `onComplete`, `onCancel`, `onReset`, `onError`). There is no plugin slot and no listener list — `onStateChange` is a single callback.
- `navigateToStep(stepId, { pushToHistory, skipLifecycle })` is the **single shared transition primitive** used by `goNext`/`goPrevious`/`goTo`. It runs `onLeave` → push history → write state → `onEnter` → `notifyStateChange()`.
- `goNext` validates → `onSubmit` → marks `completed` → resolves next → either `complete()` (no next step) or `navigateToStep`.
- An **async staleness model** guards every async boundary: `generation` is bumped by `reset()`/`cancel()`, and `isTransitionStale()` checks abort interrupted transitions. A **busy guard** (`ensureNotBusy`) rejects re-entrant navigation.
- `handleError()` wraps non-Errors and calls `events.onError` (does not rethrow); nav methods rethrow after calling it.
- Errors (`packages/core/src/errors.ts`): `WizardError` base + `WizardValidationError`, `WizardNavigationError(message, stepId?, reason?)`, `WizardConfigurationError`, `WizardRestoreError`, `WizardAbortError`.
- React/Vue do not construct the machine directly — they go through `@gooonzick/wizard-state`'s manager (`packages/state/src/manager.ts`), which owns the machine and exposes a channel-based `subscribe`.
- Tests: Vitest, `packages/core/tests/*.test.ts`. Changesets: 4 publishable packages in a `fixed` group (bump together). Docs: VitePress site at `packages/docs/` (sidebar in `.vitepress/config.ts`) plus a root `docs/` tree.

## 3. New Types

New file `packages/core/src/plugins/types.ts`, re-exported from the core barrel (`packages/core/src/index.ts`).

```typescript
interface TransitionEvent<TData> {
  type: "next" | "previous" | "goTo";
  fromStepId: StepId;
  toStepId: StepId;
  data: TData;
  timestamp: number;
}

interface ErrorContext<TData> {
  stepId: StepId;
  phase: "validation" | "transition" | "lifecycle" | "submit";
  data: TData;
}

// Read-only view passed to onInit so plugins can inspect but not mutate.
interface WizardMachineReadonly<TData> {
  readonly snapshot: WizardState<TData>;
  readonly currentStep: WizardStepDefinition<TData>;
  getStepStatus(stepId: StepId): StepStatus;
}

interface WizardPlugin<TData = unknown> {
  name: string;                       // unique; used by removePlugin
  onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;
  beforeTransition?(e: TransitionEvent<TData>): boolean | void | Promise<boolean | void>; // return false to veto
  afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;
  onError?(error: WizardError, ctx: ErrorContext<TData>): void | Promise<void>;
  onComplete?(data: TData): void | Promise<void>;
  onReset?(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}
```

`onDataChange` is intentionally NOT included (deferred to WIZ-010).

## 4. Registration API

New methods on `WizardMachine<TData>`:

```typescript
use(plugin: WizardPlugin<TData>): this;   // chainable; throws WizardConfigurationError on duplicate name
removePlugin(name: string): void;          // calls that plugin's destroy(), then drops it
destroy(): Promise<void>;                  // calls destroy() on all plugins in REVERSE registration order
```

- Plugins are stored in an **ordered list** (registration order). All hook dispatch follows registration order, EXCEPT `destroy`, which runs in reverse (symmetric teardown).
- The machine constructor gains an optional `plugins?: WizardPlugin<TData>[]` argument/option (registered in array order during construction). Each plugin's `onInit` fires right after the machine's initial state is seeded.
- `use()` is allowed after construction. If the machine is already initialized, the newly added plugin's `onInit` is invoked immediately.
- Duplicate `name` on `use()` throws `WizardConfigurationError`.

## 5. Hook Dispatch Points & Ordering

A new private helper class `PluginHost` (`packages/core/src/plugins/plugin-host.ts`) owns the plugin list and all dispatch logic, keeping `wizard-machine.ts` lean. The machine holds one `PluginHost` and calls into it at these points:

### `beforeTransition` (veto-capable)
- Fires inside `navigateToStep()` at the very top, BEFORE `onLeave` and the state write, where both `fromStepId` (`currentStep.id`) and `toStepId` are known.
- Dispatched in registration order, **awaited sequentially**.
- If any plugin returns `false` → **silent cancel**: no leave/enter, no state write, no `onStateChange`, no `afterTransition`. `goTo` propagates this as `return false`; `goNext`/`goPrevious` resolve as no-ops.
- If a plugin **throws** → abort the transition and route through `handleError` with `phase: "transition"`, then rethrow (consistent with existing nav-method behavior).
- After the awaited dispatch, an `isTransitionStale()` check runs before proceeding (a plugin may have awaited while `reset`/`cancel` interrupted).
- Fires regardless of `skipLifecycle`.

### `afterTransition`
- Fires inside `navigateToStep()` AFTER the state write, `onEnter`, AND `notifyStateChange()` (so subscribers already observe the committed new state).
- Registration order. Each plugin wrapped in try/catch → a throw routes to `onError` (`phase: "transition"`) and is isolated; remaining plugins still run; navigation already succeeded.

### `onComplete`
- In `complete()`, after `definition.onComplete` and `events.onComplete`. Isolated per-plugin.

### `onReset`
- In `reset()`, after `events.onReset`. Isolated. Fires for both `reset()` and `cancel()` (cancel calls reset).

### `onError`
- Wired into the existing `handleError()`. After it calls `events.onError`, it dispatches to each plugin's `onError`. A throw INSIDE a plugin's `onError` is swallowed (at most `console.error`) — no recursion.

### `onInit`
- After initial state seeding (constructor plugins) or immediately on late `use()`.

### `destroy`
- Reverse registration order, isolated, on `machine.destroy()` and (for one plugin) `removePlugin()`.

### Ordering for a normal `goNext` step change

```
validate -> onSubmit -> status=completed -> resolveNext
  -> navigateToStep:
       beforeTransition (sequential, veto/throw aware)   <- NEW
       [staleness check]
       onLeave -> push history -> write state -> onEnter
       notifyStateChange
       afterTransition (isolated)                        <- NEW
```

### Transition boundary rules

- `beforeTransition`/`afterTransition` fire on every actual step-to-step change via `goNext`/`goPrevious`/`goTo`, regardless of `skipLifecycle`.
- They do NOT fire on completion (`goNext` with no next step → `complete()` → `onComplete` instead), nor on `reset()`/`cancel()` (→ `onReset` instead).

## 6. Error Handling Policy

- `beforeTransition` throw → aborts the transition (same end state as a veto) AND routes through `handleError`/`onError` (`phase: "transition"`).
- A throw in any non-blocking hook (`afterTransition`, `onComplete`, `onReset`, `onInit`, `destroy`) is caught, routed to `onError`, and does NOT crash the wizard or stop the remaining plugins.
- A throw inside a plugin's `onError` is always caught and swallowed (at most `console.error`) — never re-routed (prevents infinite loops).

## 7. Veto Semantics

A `beforeTransition` returning `false` is a **silent cancel** (normal control-flow outcome, not an error):
- No `onStateChange`, no `afterTransition`.
- `goTo` returns `false`; `goNext`/`goPrevious` resolve without transitioning (current step unchanged).
- A plugin that wants to surface a reason can do so itself (set state / log), or escalate to an error by throwing.

## 8. React / Vue / State Wiring

`plugins?: WizardPlugin<TData>[]` is added at each layer:

- **`@gooonzick/wizard-state` manager:** options type gains `plugins`, passed straight into the `WizardMachine` constructor. The manager calls `machine.destroy()` in its existing teardown/dispose path so plugin `destroy()` runs when the manager is torn down.
- **React (`useWizard`, `WizardProvider`):** options type gains `plugins`. Plugins are treated as **reference-stable** (read once at machine creation, like `definition`/`initialData`), NOT reactive. Document that plugins must be defined outside render or memoized. `destroy()` runs via the existing React effect cleanup.
- **Vue (`useWizard`, `wizard-provider`):** same `plugins` option, passed at setup time. `destroy()` runs via the existing `onScopeDispose` cleanup.

No new public components — additive option only.

## 9. Reference Plugin: `createLoggingPlugin`

Location `packages/core/src/plugins/logging.ts`. Exported from the main barrel AND via a new `./plugins` subpath export in core's `package.json` (so `import { createLoggingPlugin } from "@gooonzick/wizard-core/plugins"` works, aligning with WIZ-016's planned import style).

```typescript
function createLoggingPlugin<TData>(config?: {
  level?: "debug" | "info" | "warn";                // default "debug"
  logger?: Pick<Console, "log" | "warn" | "debug">; // default console
}): WizardPlugin<TData>;
```

- Implements every hook (`onInit`, `beforeTransition`, `afterTransition`, `onComplete`, `onReset`, `onError`, `destroy`) as a pure observer.
- Logs `from -> to` on transitions, init/complete/reset/destroy events, and errors.
- Never vetoes, never throws. Doubles as the canonical "how to write a plugin" doc example.

## 10. Testing Plan

New file `packages/core/tests/plugins.test.ts` (Vitest, existing conventions):

- `onInit` fires on construction and on late `use()`; receives a read-only view.
- `use()` is chainable; duplicate name throws `WizardConfigurationError`; `removePlugin` calls `destroy` and drops it.
- `beforeTransition` fires before the step change with correct `from`/`to`/`type` for `goNext`/`goPrevious`/`goTo`.
- `beforeTransition` returning `false` → silent cancel (no state change, no `afterTransition`, `goTo` returns `false`, step unchanged).
- `beforeTransition` throwing → transition aborted + routed to `onError` (`phase: "transition"`).
- `afterTransition` fires after the committed state change (observes the new `currentStepId`).
- Multiple plugins run in registration order; a throw in a post-hoc hook is isolated (others still run, navigation succeeds).
- A throw inside `onError` is swallowed (no recursion / infinite loop).
- `beforeTransition`/`afterTransition` do NOT fire on completion, `reset`, or `cancel`; `onComplete`/`onReset` do.
- `beforeTransition`/`afterTransition` still fire under `goTo({ skipLifecycle: true })`.
- Staleness: a `beforeTransition` that awaits while `reset()` runs does not corrupt state.
- `destroy()` runs all plugins in reverse order.
- React test + Vue test: the `plugins` option threads through and `destroy` runs on unmount/dispose.
- `createLoggingPlugin`: logs each hook via an injected fake logger; respects `level`; never vetoes/throws.

## 11. Documentation Updates

- **`packages/docs/` (VitePress):** new page `guide/plugins.md` — concept, `WizardPlugin` interface, registration (`use`/`removePlugin`/`plugins` option/`destroy`), hook reference table with firing order, veto & error semantics, the `skipLifecycle` rule, React/Vue usage, and `createLoggingPlugin` worked example + a "writing your own plugin" walkthrough. Register it in `.vitepress/config.ts` sidebar (new "Plugins" item under Guide). Update `guide/api/core.md` with the new machine methods/types.
- **Root `docs/`:** add a "Plugins / Middleware" section to `api-reference.md` and a short conceptual mention in `core-concepts.md`.
- **`docs/ROADMAP.md`:**
  - Mark WIZ-007 ✅ (status line + the "What is Already Implemented" table + the competitor matrix "Middleware / plugins" row).
  - Rewrite the WIZ-007 API block to match what shipped (machine-level `use()` + `plugins` option, no builder `.use()`, `onDataChange` removed).
  - Add a note under WIZ-010 that it should extend the plugin API with `onDataChange` (non-breaking).
  - Note that built-in analytics/auto-save remain WIZ-016 / future.

## 12. Changeset

One changeset under `.changeset/` (minor, additive). The `fixed` group bumps core/react/vue/state together, consistent with prior features.
