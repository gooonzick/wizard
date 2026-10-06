# WIZ-013 — Lazy Steps — Design Spec

**Status:** Approved (brainstorming)
**Date:** 2026-10-06
**Package(s):** `@gooonzick/wizard-core` (feature); `@gooonzick/wizard-state`, `-react`, `-vue`, `-svelte`, `-solid` (expose `isLoadingStep`)
**Release:** Minor, additive. With the fixed group this ships as **1.12.0**. One documented behaviour change for plugins (new `ErrorContext.phase` value `"load"`, see §5).
**Branch:** `feat/wiz-013-lazy-steps`

## 1. Context & Goals

Large wizards pay for every step's heavy implementation (Zod/Valibot schemas, big validators, lifecycle code) at initialisation. WIZ-013 lets a step defer that implementation to a dynamic `import()` that runs the first time the step's implementation is actually needed.

### Scope decisions (from brainstorming)

- **Only the step implementation is lazy, not the step itself.** The ROADMAP sketch made the step *value* a function (`heavy: () => import(...)`). That would hide `next` / `previous` / `enabled` / `meta` until load, but `definition.steps[id]` is read synchronously in ~25 places in `wizard-machine.ts` (constructor, `initializeStepStatuses`, the `currentStep` getter, `resolveNextStepSync` / `isLastStep`, `computeProgress`, `isKnownStepId`, `restore()`), and `step-resolver.ts` reads `enabled` on *unvisited* steps to skip disabled ones. Making the step value lazy would turn all of these async or "unknown" and push the feature into a 2.0.0. Instead the step **skeleton** (`id`, `next`, `previous`, `enabled`, `meta`) stays eager and only `validate` / `onEnter` / `onLeave` / `onSubmit` are loaded lazily. This solves the stated problem (heavy validation schemas) and keeps progress, `isLastStep`, disabled-step skipping, `canNavigateToStep`, `getAvailableSteps` and the future WIZ-012 graph export working without any load.
- **Load errors get a new plugin phase `"load"`** (not reused `"transition"`), so analytics/logging can tell a failed chunk from a failing resolver or `onSubmit`.
- **`preloadStep(stepId)`** is public, for prefetching (hover, idle, entering the previous step).
- **A hook defined both on the skeleton and in the loaded implementation → the loaded one wins.**
- **Every framework example app gets a "Lazy Steps" demo** (§8).

### Non-goals

- Lazy `next` / `previous` / `enabled` / `meta`, or lazily discovered steps.
- Lazy UI components — that is the framework's job (`React.lazy`, `defineAsyncComponent`, Svelte `{#await import()}`, Solid `lazy`).
- Automatic prefetch heuristics (e.g. preloading the next step on enter). `preloadStep` is the primitive; policy stays with the app.
- Unloading / evicting successfully loaded implementations.

## 2. Current State (relevant existing architecture)

- `WizardStepDefinition<T>` (`packages/core/src/types/step.ts`) holds transitions, `enabled`, `validate`, `onEnter`, `onLeave`, `onSubmit`, `meta`.
- `WizardMachine` (`packages/core/src/machine/wizard-machine.ts`) guards every `await` with a generation counter / `isTransitionStale()` so `reset()` / `cancel()` / `restore()` supersede in-flight work. Navigation goes through `withTransition()` (busy guard) → `navigateToStep()`, which dispatches plugin `beforeTransition` first, then `onLeave`, the state write, `onEnter`, `afterTransition`.
- Hook call sites: `initializeFirstStep()` (initial `onEnter`), `validate()` (current `validate`), `validateAll()` (every enabled step's `validate`, isolated from plugins), `goNext()` / `submit()` (current `onSubmit`), `navigateToStep()` (`onLeave` / `onEnter`).
- `ErrorContext.phase` (`packages/core/src/plugins/types.ts`) is `"validation" | "transition" | "lifecycle" | "submit" | "data" | "state"`.
- `WizardStateManager` (`packages/state/src/manager.ts`) picks snapshot fields explicitly into channel caches; `LoadingState` (`isValidating` / `isSubmitting` / `isNavigating`) is owned by the manager via reference-counted `trackLoading()`. Bindings expose these flags in their loading slices and (Svelte runes / Solid) as flat getters.
- No binding accesses private machine members via bracket notation (verified with `grep 'machine\["'`).

## 3. Public API

### Types (`types/step.ts`, exported from `index.ts`)

```ts
/** The part of a step that may be loaded lazily. */
export type LazyStepImplementation<T> = Pick<
	WizardStepDefinition<T>,
	"validate" | "onEnter" | "onLeave" | "onSubmit"
>;

/** Loads a step implementation; module namespaces with a default export are accepted. */
export type StepLoader<T> = () => Promise<
	LazyStepImplementation<T> | { default: LazyStepImplementation<T> }
>;

export interface WizardStepDefinition<T> {
	// ...existing fields
	/** WIZ-013: lazily loaded implementation (validate / onEnter / onLeave / onSubmit). */
	load?: StepLoader<T>;
}
```

- The `Pick` is the type-level guarantee that nothing the machine needs synchronously can live in the lazy part. At runtime only these four keys are read from the loaded object; anything else is ignored.
- Module normalisation: if the resolved value has an own `default` property that is an object, use it; otherwise use the value itself. A non-object result is a load error (§5).
- Merge: `resolved = { ...skeleton, ...definedKeysOf(loaded) }` — a loaded key that is `undefined` does not erase a skeleton hook.

### Builder (`builders/create-step.ts`)

```ts
createWizard<Data>("big-form")
	.step("heavy", (s) => s.title("Documents").next("summary").lazy(() => import("./steps/heavy")))
	.build();
```

`StepBuilder.lazy(loader: StepLoader<T>): this` sets `load`. `createStep` gets it for free.

### Machine

```ts
interface WizardState<T> {
	// ...existing
	/** WIZ-013: true while the current/target step's implementation is loading. Transient. */
	isLoadingStep: boolean;
}

class WizardMachine<T> {
	/** Starts (or joins) loading a step's implementation without navigating. Never sets isLoadingStep. */
	preloadStep(stepId: StepId): Promise<void>;
}
```

- `preloadStep` throws `WizardNavigationError` (reason `"not-found"`) for an unknown id, resolves immediately for a step without `load` or already loaded, rejects with `WizardStepLoadError` on failure (and does **not** report through `onError` — the caller owns the promise; a later navigation that hits the same failure reports it).
- The `currentStep` getter returns the merged definition once the current step is loaded, the skeleton before that.

### Errors (`errors.ts`)

```ts
export class WizardStepLoadError extends WizardError {
	constructor(public readonly stepId: StepId, options?: { cause?: unknown });
	// message: `Failed to load step "${stepId}"`
}
```

Exported from `index.ts`.

## 4. Machine Behaviour

### Cache

- Per machine instance: `Map<StepId, Promise<WizardStepDefinition<T>>>` for in-flight/settled loads plus `Map<StepId, WizardStepDefinition<T>>` for resolved merged definitions.
- Concurrent requests for the same step share one promise (one `import()`).
- Success is cached for the lifetime of the machine and survives `reset()` / `cancel()` / `restore()` (it is definition-scoped, not runtime state).
- Failure evicts the entry, so the next request retries.

### `ensureStepLoaded(stepId, { foreground })` (private)

- Steps without `load`, or already loaded → returns synchronously-resolved, **no state change, no emission**. Existing emission-count tests for non-lazy wizards stay valid.
- Foreground loads (navigation, initial step, `validate()`) increment a per-generation counter; on 0 → 1 set `isLoadingStep: true` and emit one `onStateChange`; on 1 → 0 set `false` and emit one `onStateChange`. Loads started under an older generation never touch the flag. `reset()` / `cancel()` / `restore()` rebuild state with `isLoadingStep: false`.
- Background loads (`preloadStep`, `validateAll`) never touch the flag.

### Where loads happen

| Call site | Loads | Notes |
| --- | --- | --- |
| `initializeFirstStep()` | initial step | Before `onEnter`. Generation-checked after the await. Failure → reported (phase `"load"`), `onEnter` / `onStepEnter` skipped; the machine stays usable and the next `validate()` / navigation retries. |
| `validate()` | current step | Before running the validator. Failure → reported once (phase `"load"`), returns `{ valid: false, errors: { general: "Failed to load step" } }`, and marks the call as already reported so `goNext()` / `goTo()` / `submit()` do not re-report it as a validation failure. |
| `goNext()` / `submit()` | current step (via `validate()`) | `onSubmit` therefore always runs on the loaded definition. |
| `navigateToStep()` | current **and** target, in parallel | Only when `skipLifecycle` is false. Runs **before** `beforeTransition`, `onLeave` and any state write, so a failure leaves the machine exactly where it was (no half-committed state like the `onEnter`-throws case). Followed by `isTransitionStale()`. |
| `goTo(…, { skipLifecycle: true })` | nothing | Hooks are skipped anyway; the step loads on demand at the next `validate()` / navigation. |
| `validateAll()` | every enabled lazy step, in parallel (`Promise.allSettled`) | Stays isolated from plugins and does not emit: a failed load becomes `{ valid: false, errors: { _error: message } }` for that step, like a throwing validator. |
| `restore()` | nothing | Stays synchronous; the restored current step loads on demand. |

- Transitions keep their busy semantics: a load inside `goNext` / `goPrevious` / `goTo` / `goBack` happens inside `withTransition`, so `isBusy` is `true` and concurrent navigation is rejected as today.
- `destroy()` during a load: the settled load is ignored (existing `checkAborted` / generation checks).
- Transition events, `beforeTransition` veto semantics and `afterTransition` are unchanged; plugins see no new hooks.

## 5. Errors & Reporting

- Any rejection / invalid shape from a loader is wrapped in `WizardStepLoadError(stepId, { cause })`.
- Navigation, `submit()` and `validate()` report it **once** through `handleError(err, "load")` → `events.onError` and plugin `onError` with `ErrorContext.phase === "load"`. Navigation then rejects with the same `WizardStepLoadError`; `validate()` resolves invalid as described in §4.
- `ErrorContext.phase` gains `"load"`. **Behaviour change** (same class as `"state"` in 1.10.0): plugins with an exhaustive `switch` on `phase` need a `"load"` case. Called out in the changeset.
- `preloadStep()` and `validateAll()` never call `handleError`.

## 6. State Manager & Bindings

- `@gooonzick/wizard-state`: `LoadingState` gains `isLoadingStep: boolean`. Unlike the other flags it is **sourced from `machine.snapshot.isLoadingStep`**, not from `trackLoading()`. When a machine state change flips it, the manager refreshes the `"loading"` cache and notifies the `"loading"` channel (plus `"all"`). `forceLoadingOff` / reset paths leave it to the machine (the machine already resets it).
- React (`useWizard`, granular `useWizardLoading`), Vue (`useWizard`, granular composables), Svelte (stores + runes, including the flat getter), Solid (loading slice + flat getter) expose `isLoadingStep` wherever they expose `isNavigating`. Type additions are additive.

## 7. Testing

Vitest; assertions through public API, events and spies only (AGENTS.md §4). Loaders are controllable deferreds (`createDeferred()` helper) so tests can observe the in-flight state.

`packages/core/tests/lazy-steps.test.ts`:

- Lazy step loads on first navigation into it; loader called once; `onEnter` from the loaded module runs.
- `isLoadingStep` emission sequence: `true` (still on the old step) → `false` → navigation commit; no extra emissions for non-lazy steps.
- Repeated navigation (back and forth, after `reset()`) does not call the loader again.
- Concurrent `validate()` + `goNext()` into/on the same lazy step → one loader call.
- Load failure: `goNext()` rejects with `WizardStepLoadError`, `onError` called once, plugin `onError` with phase `"load"`, current step unchanged, no `onLeave` / `beforeTransition`; next `goNext()` retries and succeeds.
- `reset()` / `cancel()` / `restore()` during a pending load: transition superseded, `isLoadingStep` ends `false`, late resolution does not navigate or emit.
- Lazy initial step: `onEnter` runs after load; failure reported with phase `"load"`, wizard still navigable after a successful retry.
- `restore()` onto a lazy step, then `validate()` loads and runs the lazy validator.
- `goTo(id, { skipLifecycle: true })` does not load.
- Merge rule: loaded hook overrides skeleton hook; skeleton hook kept when the loaded key is absent/`undefined`.
- Module shapes: `{ default: impl }` and bare `impl`; a non-object result → `WizardStepLoadError`.
- `validateAll()` loads all enabled lazy steps, skips disabled ones, reports a failed load as `_error` without plugin dispatch.
- `preloadStep()`: no `isLoadingStep` flip, later navigation does not call the loader again, unknown id throws, failure rejects without `onError`.
- Progress / `isLastStep` / `getAvailableSteps` identical with and without `load` (no loader calls).
- `StepBuilder.lazy()` sets `load`; type tests (`expectTypeOf`): `LazyStepImplementation<T>` has exactly the keys `validate` / `onEnter` / `onLeave` / `onSubmit`, and a loader whose result is typed with `next` / `enabled` / `meta` is not assignable when those are the only keys (runtime ignores extra keys anyway).

`packages/state/tests`: `isLoadingStep` in the loading slice follows the snapshot, notifies `"loading"`, survives `trackLoading` reference counting untouched.

One smoke test per binding (`react`, `vue`, `svelte` stores + runes, `solid`): navigating into a lazy step exposes `isLoadingStep === true` until the deferred resolves.

**Verification before completion:** `pnpm test`, `pnpm typecheck`, `pnpm lint:fix`, `pnpm build`.

## 8. Example Apps

Every app in `examples/` gets a **"Lazy Steps"** tab wired like the existing tabs (React `tabs` in `App.tsx`; Vue `ApproachToggle` + `App.vue`; Svelte and Solid `TABS` in `App`).

- Shared scenario: three steps `account → documents → summary`. `documents` keeps `next` / `previous` / `meta` in the skeleton; its `validate` + `onEnter` live in `documents-step.ts`, attached with `.lazy(() => import("./documents-step"))`, so Vite emits a separate chunk (visible in the Network tab). The module awaits an artificial 800 ms delay so the spinner is visible.
- UI: spinner while `isLoadingStep`; a "Fail next load" checkbox that makes the next load reject once (error shown via `onError`, retry on the next Next succeeds); `preloadStep("documents")` on hover of Next on `account` (no spinner afterwards).
- React (`useWizard`), Vue (`useWizard`), Svelte (runes API), Solid (`createWizard`).
- No new dependencies — the lazy validator is hand-written.

## 9. Docs & Release

- Docs site (`packages/docs/guide/`) and the root `docs/` mirror:
  - `defining-wizards.md`: new "Lazy steps" section (what is lazy and why, loader shape, merge rule, `preloadStep`, error handling, `isLoadingStep`).
  - `core-concepts.md`: `isLoadingStep` in the state description.
  - `plugins.md`: `"load"` phase.
  - `api/core.md` (+ root `docs/api-reference.md`): `load`, `StepLoader`, `LazyStepImplementation`, `StepBuilder.lazy`, `preloadStep`, `WizardStepLoadError`, `isLoadingStep`.
  - `api/{react,vue,svelte,solid}.md` and the integration guides: `isLoadingStep` in the loading slice.
- Package READMEs (`packages/core/README.md` + binding READMEs where loading flags are listed).
- Agent skill: `.agents/skills/wizard-library/references/api_reference.md` and `architecture_and_changes.md`.
- `.changeset/wiz-013-lazy-steps.md`: `minor` for the fixed group; mentions the `"load"` phase behaviour change.
- `docs/ROADMAP.md`: WIZ-013 → `✅ Done (see "Shipped vs. specced deltas")` with deltas (implementation-only laziness via `load` instead of a function step value; `.lazy()` on `StepBuilder` instead of `WizardBuilder.lazyStep()`; `preloadStep`; `WizardStepLoadError` + `"load"` phase; `isLoadingStep` also exposed by `wizard-state` and every binding); "What is Already Implemented" row; Appendix A (`✅ 1.12.0`); Appendix B row → "Additive, non-breaking (optional `load` field)" and drop the 2.0.0 reservation; 1.12.0 row in the release table; remaining backlog → WIZ-011, WIZ-012.

### Commit sequence on `feat/wiz-013-lazy-steps`

1. ROADMAP sync to 1.11.2 (done) + this spec.
2. Core: types, errors, builder, machine, tests.
3. `wizard-state` + bindings + tests.
4. Example apps.
5. Docs + agent skill.
6. Changeset + ROADMAP WIZ-013.

Then one PR against `main`.
