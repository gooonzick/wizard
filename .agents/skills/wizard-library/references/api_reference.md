# Wizard API Reference

## Table of Contents

- Core packages and primary exports
- Transition and guard patterns
- Validation patterns
- Framework adapter surface
- Typical implementation snippets

## Core Packages and Primary Exports

Use public exports from `@gooonzick/wizard-core`:

- Builders: `createWizard`, `createLinearWizard`, `createStep`
- Machine: `WizardMachine`, `WizardEvents`, `WizardState`
- Data-change API (WIZ-010): `WizardMachine.updateField(field, value)` (Object.is no-op guard),
  `WizardMachine.watchField(field, cb)` (returns an unsubscribe fn; core-only, not exposed via hooks),
  and the `WizardEvents.onDataChange(prev, next, changedFields)` event.
- Transitions: `resolveTransition`, `andGuards`, `orGuards`, `notGuard`, `evaluateGuard`
- Validators: `requiredFields`, `combineValidators`, `createValidator`, `createStandardSchemaValidator`
- Built-in plugins: `createLoggingPlugin` (reference logger),
  `createAnalyticsPlugin` (auto step-timing / backtrack / drop-off collector with a
  synchronous `getReport(): AnalyticsReport`) and `createPersistencePlugin`
  (restore-on-init + debounced auto-save, with the built-in `localStorageAdapter` /
  `sessionStorageAdapter`). All are re-exported from the main barrel and from the
  `@gooonzick/wizard-core/plugins` subpath.
- Lazy steps (WIZ-013): `WizardStepDefinition.load`, `StepLoader`, `LazyStepImplementation`,
  `StepBuilder.lazy(loader)`, `WizardMachine.preloadStep(stepId)`, `WizardState.isLoadingStep`,
  `WizardStepLoadError` (`stepId`, `cause`). See "Lazy steps" below.
- Types: `WizardData`, `WizardDefinition`, `WizardStepDefinition`, `StepTransition`, `WizardContext`

Prefer building on exported APIs over importing deep internal modules.

The React, Vue, Svelte and Solid adapters additionally re-export state-layer types from
`@gooonzick/wizard-state` for typing consumers: all expose `StateSnapshot`,
`LoadingState`, `NavigationState`, `ValidationState`, and `SubscriptionChannel`
(alongside `WizardStateManager`). Prefer these public re-exports over importing the
state package directly.

## Transition and Guard Patterns

`StepTransition<T>` supports exactly three transition kinds:

1. Static:

```ts
next: { type: "static", to: "shipping" }
```

2. Conditional:

```ts
next: {
	type: "conditional",
	branches: [
		{ when: (data) => Boolean(data.isBusiness), to: "business" },
		{ when: () => true, to: "personal" },
	],
}
```

3. Resolver:

```ts
next: {
	type: "resolver",
	resolve: async (data, ctx) => {
		const policy = await ctx.policyClient.getRoute(data);
		return policy.nextStep;
	},
}
```

Guard contract:

- Signature: `(data, ctx) => boolean | Promise<boolean>`
- Keep guards free of side effects.

## Validation Patterns

Compose validators instead of embedding large monolithic validate functions:

```ts
validate: combineValidators(
  requiredFields("email", "name"),
  createValidator(
    (data) => String(data.email).includes("@"),
    "Email is invalid",
    "email",
  ),
);
```

Use `createStandardSchemaValidator()` for Standard Schema compatible validators.

## Framework Adapter Surface

React (`@gooonzick/wizard-react`) and Vue (`@gooonzick/wizard-vue`) expose aligned slices
via the main composable/hook `useWizard`:

- `state`
- `validation`
- `navigation`
- `loading`
- `actions`

Both adapters also expose granular hooks/composables for fine-grained subscriptions:
`useWizardData`, `useWizardNavigation`, `useWizardValidation`, `useWizardLoading`,
`useWizardActions`, and `useWizardField`.

`useWizardField` is a controlled single-field binding with two overloads — provider
mode `useWizardField(field)` (inside `<WizardProvider>`) and direct mode
`useWizardField(wizard, field)`. In React it returns a `[value, setValue]` tuple; in
Vue it returns a `WritableComputedRef` for `v-model`. Hooks-rules caveat: a single
call site must not switch between provider and direct mode across renders.

When changing wizard behavior, verify these slices/hooks still return expected semantics.

Svelte (`@gooonzick/wizard-svelte`) exposes the same four slices plus `actions`, but
through Svelte primitives rather than a hook/composable:

- Main entry (Svelte 4 + 5): `createWizardStore(options)` returns a `Readable`
  aggregate (`$wizard` — the four slices flattened) plus `state` / `validation` /
  `navigation` / `loading` sub-stores, `actions`, `goNext`/`goPrevious`/`goTo`
  (+ deprecated `goBack`/`goToStep`), `field(key): Writable<T[K]>`,
  `getMachine()` / `getManager()`, `destroy()` and `isDestroyed`.
- `@gooonzick/wizard-svelte/runes` (Svelte 5 only): `createWizard(options)` returns the
  same surface with flat rune getters and `field(key): { get value, set value }`.
- Context helpers on both entries: `setWizardContext` / `getWizardContext` /
  `hasWizardContext` (distinct context key per layer).
- The aggregate is never `Writable`: `bind:value={$wizard.data.x}` is a compile error by
  design. Two-way binding goes through `field(key)`, which calls `machine.updateField`.
- Machine lifetime is bound to `createWizardStore()`…`destroy()`, never to subscriber
  count. `autoDestroy` (default `true`) registers `onDestroy` inside a try/catch.
- There are deliberately no granular helpers — `derived()` plus the four sub-stores cover
  that ground.

Solid (`@gooonzick/wizard-solid`, Solid 1.x) mirrors the Svelte runes surface with signals:

- `createWizard(options)` returns flat reactive getters (`wizard.currentStepId`,
  `wizard.canGoNext`, …), slice getters `state` / `validation` / `navigation` / `loading`,
  `actions`, `goNext`/`goPrevious`/`goTo`,
  `field(key): { get value, set value }`, `getMachine()` / `getManager()`, `destroy()`
  and `isDestroyed`.
- Four signals (one per manager channel) are refreshed from ONE `"all"` subscription
  inside `batch()` (atomic) wrapped in `try/catch` (a throwing user effect goes to
  `onError`, never into the machine). Tracking is per channel, not per field.
- Context: `<WizardProvider wizard={wizard}>` (takes an existing wizard, never destroys
  it) + `useWizardContext<T>()` (throws without a provider) / `hasWizardContext()`.
- `autoDestroy` (default `true`) registers `onCleanup` only when `getOwner()` is non-null.
- Destructuring the wizard loses reactivity (like Solid props).

Lazy steps in the adapters (WIZ-013): `isLoadingStep` sits in every `loading` slice next to
`isNavigating` (React/Vue `useWizardLoading`, Svelte stores + runes incl. the flat getter,
Solid loading slice + flat getter) and `actions.preloadStep(stepId)` is in every `actions`
slice. `isLoadingStep` mirrors `machine.snapshot.isLoadingStep`; `@gooonzick/wizard-state`
exports `TrackedLoadingFlag` (the flags `trackLoading()` accepts), so
`trackLoading("isLoadingStep")` is a type error.

All four adapters accept an `onDataChange` option — React/Vue `useWizard` (and
`<WizardProvider>`), Svelte `createWizardStore` / runes `createWizard`, and Solid
`createWizard` — `(prevData, nextData, changedFields) => void` (plain `T` params) — that
fires on data mutations. `actions.updateField` delegates to the core
`updateField` (Object.is no-op). `watchField` is core-only and is NOT part of the
adapter surface.

## Typical Implementation Snippets

### Build a definition and run machine

```ts
import { requiredFields } from "@gooonzick/wizard-core";
import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";

type FormData = {
  name: string;
  email: string;
};

const definition = createLinearWizard<FormData>({
  id: "signup",
  steps: [
    { id: "name", validate: requiredFields<FormData>("name") },
    { id: "email", validate: requiredFields<FormData>("email") },
  ],
});

const machine = new WizardMachine(definition, {}, { name: "", email: "" });
await machine.goNext();
```

### Extend with context

```ts
const machine = new WizardMachine(
  definition,
  { debug: true, apiClient },
  initialData,
);
```

Use context for external dependencies instead of hard-coding globals in guards/resolvers.

### Data update semantics

- `setData(data)` deep-CLONES its argument (matching constructor / `reset` /
  `serialize`), so mutating the object you passed afterward does NOT retroactively
  mutate wizard state.
- `updateData(updater)` takes an `(data) => data` updater and uses its return value
  directly (documented in/out contract) — it does NOT clone.
- `updateField(field, value)` updates one top-level field with an `Object.is`
  no-op guard: setting a field to its current value does nothing (no
  `onStateChange`, no `onDataChange`). Produces `changedFields = [field]`.
- `onDataChange(prevData, nextData, changedFields)` (a `WizardEvents` member)
  fires AFTER `onStateChange` on any `updateField`/`updateData`/`setData` that
  changes ≥1 top-level field. `changedFields` is a shallow (`Object.is`) diff of
  top-level keys. NOT fired on `reset()`, `restore()`, or navigation. Handler
  errors are isolated and routed to `onError` with `phase: "data"`.
- `watchField(field, cb)` subscribes to a single field, calls back with
  `(newValue, oldValue)`, and returns an unsubscribe function. Core-only.
- Plugin hook `onDataChange(prevData, nextData, changedFields)` (DeepReadonly
  payloads, fire-and-forget, errors → `onError` phase "data") is part of
  `WizardPlugin` (WIZ-010). `ErrorContext.phase` now includes `"data"`.
- A throwing `onStateChange` subscriber is isolated: the error goes to
  `events.onError` and plugin `onError` with `phase: "state"`; the in-flight
  operation (`goNext()`, `updateField`, ...) is NOT rejected.
- `snapshot`, its `stepStatuses`, and `snapshot.progress` (with its `enabledStepIds`
  array) are frozen; `snapshot.data` is intentionally NOT frozen.

### Lazy steps (WIZ-013)

```ts
// steps/documents.ts
export default {
	validate: createStandardSchemaValidator(heavySchema),
	onEnter: async (data, ctx) => {},
} satisfies LazyStepImplementation<Application>;

createWizard<Application>("loan").step("documents", (s) =>
	s.title("Documents").previous("personal").next("summary")
		.lazy(() => import("./steps/documents")),
);
// declarative: { id: "documents", next, previous, load: () => import("./steps/documents") }
```

- Only `validate` / `onEnter` / `onLeave` / `onSubmit` are lazy (`LazyStepImplementation<T>` is a
  `Pick` of those four). The skeleton (`id`, `next`, `previous`, `enabled`, `meta`) stays eager.
- The loader resolves to the implementation or a module namespace; an object `default` export
  wins over named exports. Loaded hooks must be functions — a non-function
  `validate` / `onEnter` / `onLeave` / `onSubmit` is a load error (`WizardStepLoadError`,
  `TypeError` cause). A hook defined on BOTH sides is composed, never replaced: `validate` →
  `combineValidators(skeleton, loaded)` (both must pass, errors merged); `onEnter` / `onLeave`
  / `onSubmit` → skeleton hook first, then the loaded one. A hook only one side defines is used
  as-is (an `undefined` loaded key keeps the skeleton's), so `.required("x").lazy(...)` keeps
  its required check. The merged definition does not keep `load`.
- `machine.preloadStep(id)` returns a promise the caller owns: it never sets `isLoadingStep`
  and never reports through `onError`, rejects with `WizardNavigationError` (`"not-found"`)
  for an unknown id and `WizardStepLoadError` on failure. Fire-and-forget on the MACHINE needs
  `.catch(() => {})`. Bindings' `actions.preloadStep(id)` (from `wizard-state`) never rejects —
  failures are reported by the navigation that needs the step — so it is safe in hover/focus
  handlers. When the preloaded step is the CURRENT step, the machine emits one
  `onStateChange` (so bindings refresh `currentStep`; the state manager refreshes its cached
  `currentStep` whenever `machine.currentStep` changes identity). `validateAll()` emits at most
  once when it loaded the current step; `canSubmit()` loads a lazy current step in the
  background (no `isLoadingStep`, no `onError`; failure → `false`).
- `WizardStepLoadError` message: `Failed to load step "<id>": <cause message>` (just
  `Failed to load step "<id>"` without a cause); `cause` is the native Error cause, so UIs
  show `error.message` only.
- Failure: navigation / `submit()` reject with `WizardStepLoadError`, reported once through
  `onError` and plugin `onError` with `phase: "load"` (each failed attempt once, even when
  several operations await it; a retry is a new attempt). The wizard stays on the current
  step. `validate()` resolves `{ valid: false, errors: { general: "Failed to load step" } }`
  without a state write; `validateAll()` marks the step invalid with `errors._error`.
- Leaving a step whose own chunk failed is NOT blocked: navigation loads the target as
  required and the current step best-effort (failure reported with phase `"load"`, the
  skeleton's `onLeave` runs); only a target failure blocks. `goNext()` / `goTo()` with
  validation / `submit()` still require the current step loaded before validating.
- A failed lazy INITIAL step has not been entered: its `onEnter` + `onStepEnter` run once, the
  next time the step is used (validated by validate / canSubmit / goNext / goTo / submit) while
  still on it. Lifecycle hooks of a step run only if it was entered: leaving it without
  validation (goPrevious, `goTo(id, { skipValidation: true })`) skips loading it and skips its
  `onLeave` (also a skeleton one) / `onStepLeave`; coming back loads and enters it normally.
  `reset()` / `cancel()` / `restore()` discard the pending entry.
- `validate()` while the user moves to another step during its load validates the NEW current
  step (no fake invalid result, no report for the step they left). The abort signal is checked
  only on entry: an abort while it waits does not reject it.
- Plugins with an exhaustive `switch` on `ErrorContext.phase` need a `"load"` case.
- `WizardState.isLoadingStep` is required: hand-built `WizardState` objects (test fakes) must
  include it.

### Built-in analytics plugin (WIZ-016)

- `createAnalyticsPlugin<TData>(config?)` returns
  `AnalyticsPlugin<TData> = WizardPlugin<TData> & { getReport(): AnalyticsReport }`.
- Optional callbacks: `onStepView(stepId, data)`, `onStepComplete(stepId, ms)`,
  `onBacktrack(from, to)`, `onWizardComplete(data, totalMs)`,
  `onDropOff(stepId, ms)`. Injectable clock via `now` (default `Date.now`).
- Timing: a step's timer closes on `afterTransition` (terminal step in `onComplete`);
  `getReport()` folds the current step's still-open visit into `stepTimings` and
  `totalDuration`.
- Backtrack = a `previous` transition OR a `goTo` to an already-viewed step.
- `onDropOff` fires from `destroy()` ONLY when the wizard never completed.
- Bookkeeping runs before user callbacks, so a throwing callback cannot corrupt the
  report. `onReset` restarts the session in place and does NOT re-emit `onStepView`.
- Register like any plugin: `machine.use(analytics)` or the `plugins` option in
  `useWizard` / `WizardProvider`.

### Built-in persistence plugin (WIZ-006)

- `createPersistencePlugin<TData>(config)` returns
  `PersistencePlugin<TData> = WizardPlugin<TData> & { ready: Promise<PersistenceRestoreOutcome<TData>>; flush(): Promise<void>; clear(): Promise<void> }`.
  Persistence ships as a PLUGIN: there is no `persistence` machine-config key and no
  new `WizardMachine` method.
- Adapter contract (async-first — every method may return a value OR a promise):
  `WizardPersistenceAdapter<TData> { load(); save(snapshot); clear(); }`, exchanging a
  `PersistedWizardSnapshot<TData>` envelope
  (`{ envelope: 1, version, savedAt, state: WizardSerializedState<TData> }`).
  Built-ins: `localStorageAdapter(key, { storage? })` and
  `sessionStorageAdapter(key, { storage? })` — storage globals are resolved lazily
  inside each call, so the module is SSR-safe and import-time side-effect free;
  unavailable storage ⇒ `load()` null, `save()`/`clear()` no-ops.
- Config defaults: `name: "persistence"`, `restoreOnInit: true`, `debounceMs: 300`
  (0 = next microtask), `version: 1`, `maxAgeMs: undefined`, `saveOnTransition: true`,
  `saveOnDataChange: true`, `clearOnComplete: true`, `clearOnReset: true`,
  `flushOnUnload: false`. Hooks: `beforeSave` (return `null` to skip a write),
  `onRestored`, `onRestoreSkipped`, `onRestoreError`, `onSaveError`.
- Restore window: a SYNC adapter applies the snapshot inside `onInit` (before `use()` /
  the constructor returns). An ASYNC load is DISCARDED — never force-applied — when the
  plugin is destroyed/superseded, when the wizard moved on (transition, data change,
  complete, reset), when `machine.isBusy`, or when the snapshot `isCompleted` and
  `clearOnComplete` is on. Writes are suppressed while a load is in flight and drained
  once it settles. Corrupt/expired/version-mismatched records are cleared.
  `onInit` NEVER throws and never returns a promise, so persistence failures never reach
  the machine's `onError`; they surface via `onRestoreError` / `onSaveError` (or one
  `console.warn` per category). `plugin.ready` settles once and never rejects.
- Writes: `afterTransition` saves immediately (absorbing a pending debounced write),
  `onDataChange` saves debounced, `onComplete` clears then goes inert until the next
  reset, `onReset`/`cancel()` DROPS the pending payload before clearing. `destroy()`
  flushes only when a write is pending. Payloads are built at flush time, in a
  single-slot coalescing queue with a serialized tail (last op wins, chain never rejects).
- `WizardMachineReadonly<TData>` gained OPTIONAL `isBusy`, `serialize()` and
  `restore(state)` members (WIZ-006) so plugins can drive persistence; hand-rolled
  three-member facades still compile, and `WizardSerializedState<T>` lost its
  `T extends WizardData` constraint.

## Installation Quick Reference

Use package-manager equivalents as needed:

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react @gooonzick/wizard-vue @gooonzick/wizard-svelte @gooonzick/wizard-solid
```

Install only the adapters your project uses.
