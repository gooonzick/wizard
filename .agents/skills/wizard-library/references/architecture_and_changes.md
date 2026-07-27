# Architecture and Change-Safety Rules

## Table of Contents

- Source-of-truth model
- Change areas to inspect
- Compatibility checklist
- Testing checklist
- Common pitfalls

## Source-of-Truth Model

`WizardMachine` in `@gooonzick/wizard-core` is the runtime authority.

Keep these behaviors machine-owned:

- Navigation (`goNext`, `goPrevious`, `goBack`, `goTo`/`goToStep`)
- Validation (`validate`, `validateAll`, `canSubmit`)
- Submission (`submit`) — rejects when busy (see contract below)
- Completion and lifecycle events
- Busy and abort checks

`submit()` acquires the SAME busy lock as navigation: if a `submit()` or navigation
is already in flight, a concurrent `submit()` rejects with a `WizardNavigationError`
(`reason: "busy"`) instead of running concurrently. This guarantees `onSubmit` runs
exactly once per successful submit (prevents double-click / `submit()`+`goNext()`
double-fire). Do not remove or bypass this lock when editing submit/navigation flow.

Do not re-implement machine behavior in React/Vue/Svelte adapters.

## Change Areas to Inspect

### Add/modify transition behavior

1. Transition type definitions (`StepTransition`, branch/guard types)
2. Transition resolution logic (`resolveTransition` behavior)
3. Machine navigation flow (`goNext`, `goPrevious`, `goBack`, `goToStep`)
4. Transition-focused tests in the active project

### Add/modify events

1. Core event definitions (`WizardEvents<T>` or equivalent)
2. React adapter (`useWizard` callbacks and state slices)
3. Vue adapter (`useWizard` callbacks and state slices)
4. Svelte adapter — BOTH layers: `packages/svelte/src/internal/wiring.ts` (store layer)
   and the inlined copy of the same wiring in
   `packages/svelte/src/runes/create-wizard.svelte.ts`. `src/runes/**` must stay
   self-contained (no imports outside it) because `svelte-package` emits declarations
   with `libRoot=src/runes`; a key-set parity test guards the duplication.
5. Documentation and examples that expose callbacks

When touching data-mutation events specifically (WIZ-010 `onDataChange` /
`watchField` / plugin `onDataChange`):
- Fire data-change notifications only from `updateField` / `updateData` /
  `setData`, and only when the shallow top-level diff is non-empty — never from
  `reset()`, `restore()`, or navigation (those write state directly).
- Emit AFTER `onStateChange`, matching the `navigateToStep` precedent.
- Isolate every subscriber (event, watcher, plugin hook): a throw routes to
  `onError` with `phase: "data"` and must not corrupt the committed update or
  block other subscribers.

### Change validators

1. Validator utility behavior (`requiredFields`, `combineValidators`, custom validators)
2. Validation-focused tests in the active project
3. Definitions/examples that rely on validator shape

### Add/modify plugin-driven persistence (WIZ-006)

1. `packages/core/src/plugins/persistence.ts` (plugin) and
   `packages/core/src/plugins/storage-adapters.ts` (built-in web-storage adapters)
2. Both barrels: `src/index.ts` and `src/plugins/index.ts`
3. `WizardMachineReadonly` in `src/plugins/types.ts` — `isBusy` / `serialize` / `restore`
   are OPTIONAL on purpose; a plugin must feature-detect and degrade, never assume
4. `tests/persistence-plugin.test.ts`, `tests/persistence-integration.test.ts`,
   `tests/storage-adapters.test.ts`, `tests/plugins-barrel.test.ts`
5. Docs mirror pair `docs/plugins.md` + `packages/docs/guide/plugins.md`, and
   `docs/api/core.md` + `packages/docs/guide/api/core.md`

Invariants:
- `onInit` must never throw and never return a promise — persistence failures must never
  reach the machine's `onError` or another plugin's `onError`.
- A late ASYNC restore is DISCARDED (`"stale"` / `"destroyed"`), never force-applied over
  live user input.
- Writes are suppressed while a load is in flight and drained once it settles, so a save
  can never clobber a record before it has been read.
- The write queue is single-slot + serialized-tail: adapter calls never overlap, the last
  scheduled op wins, and the chain never rejects.

## Compatibility Checklist

Before finishing a change:

- Confirm public API exports remain coherent for consumers.
- Confirm React, Vue and Svelte adapters still compile and expose stable slices.
- Confirm changes do not require consumers to import internal paths.
- Confirm type constraints remain `T extends WizardData` for machine/definition/adapter
  generics. Deliberate exception (WIZ-006): `WizardSerializedState<T>` is intentionally
  UNCONSTRAINED so plugin-side generics (`WizardPersistenceAdapter<TData>`,
  `PersistedWizardSnapshot<TData>`) compose without re-declaring the bound. Do not
  re-add the constraint.

## Testing Checklist

Run focused tests first (examples):

- Run transition-focused tests.
- Run validator-focused tests.
- Run adapter tests for React/Vue/Svelte where affected.

Then run project quality gates:

- Typecheck command configured by the project
- Lint/fix command configured by the project

## Common Pitfalls

- Duplicating navigation resolution logic outside `resolveTransition` or machine flow.
- Adding side effects in guards.
- Forgetting async behavior in resolver/guard paths.
- Asserting private state in tests instead of event-based outcomes.
- Editing generated distribution artifacts manually instead of source files.
- Treating `progress.isLastStep` as authoritative for async transitions. It is
  computed synchronously: it is `true` ONLY when the current step's next resolves
  synchronously to null (genuinely terminal). If the `next` transition or the target
  step's `enabled` guard is ASYNC (returns a Promise), the sync resolver returns
  "unknown" and `isLastStep` is `false` (conservative — never spuriously shows
  "Finish"). For an authoritative async answer, `await machine.getNextStepId()` and
  treat `null` as last. Do not change `isLastStep` to optimistically return `true` for
  async paths.
- Reacting to `onDataChange` by writing a field to a freshly-allocated
  object/array every time — it never satisfies the `Object.is` no-op guard and
  loops. React to `changedFields` and set converging (usually primitive) values.
- Calling `setState` (React) from a persistence `onRestored` / `onRestoreSkipped` callback
  or from `adapter.load()`. With a synchronous adapter those run inside the
  `WizardMachine` constructor, which `useWizard` invokes DURING RENDER. Use
  `plugin.ready.then(...)` from an effect instead. `save()` / `clear()` always run in a
  microtask or timer and are safe.
- Assuming `plugin.ready` re-arms per mount. It settles exactly once; under React
  StrictMode that is the first (discarded) machine's outcome. Use the `onRestored` /
  `onRestoreSkipped` callbacks when you need a per-init signal.
