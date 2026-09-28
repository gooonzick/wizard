# @gooonzick/wizard-core

## 1.11.2

## 1.11.1

## 1.11.0

### Minor Changes

- d36dcd5: Fix a batch of correctness bugs found in a full-repo review, and move every binding onto shared wiring in `@gooonzick/wizard-state`.

  `@gooonzick/wizard-core`:

  - `goNext()`/`goTo()`/`submit()` now bail out when a `reset()`/`cancel()` superseded them while an async validator was pending. Previously the initial step's `onSubmit` could run, or an "error" status was written onto the freshly reset state.
  - `complete()` awaits `definition.onComplete` **before** marking the wizard completed. A throwing `onComplete` no longer leaves `isCompleted` stuck at `true` (retry works), and a `reset()` during `onComplete` suppresses the completion events. **Observable:** `definition.onComplete` now sees `isCompleted === false`.
  - `goPrevious()` skips history entries whose `enabled` guard is now false (throws with reason `"disabled"` when none is enabled). `getPreviousStepId()` now returns exactly what `goPrevious()` would navigate to (history-first, guard-aware), which also fixes `canGoPrevious` in every binding for wizards without explicit `previous` transitions.
  - `restore()` supersedes in-flight transitions and a pending initial `onEnter`, like `reset()`.
  - An in-place-mutating `updateData` updater now commits a new data reference, so bindings re-render.
  - A passing `validate()` clears an `"error"` step status; `goTo()`/`submit()` validation failures mark `"error"` like `goNext()`.
  - Leaving a `"completed"` step via back/goTo keeps it `"completed"` (progress no longer regresses).
  - Persistence plugin: `ready` is re-armed on re-init (StrictMode / remount with a hoisted plugin instance), and a superseded init's late load no longer releases write suppression. `ready` is now a getter — read it from the plugin object after the machine is created.
  - Plugin host: dispatch no longer skips plugins when one is removed mid-dispatch, and never invokes hooks on plugins that were already destroyed.
  - Steps disabled by a function `enabled` guard are now marked `"skipped"` (re-evaluated after every navigation and after the initial step entry), so they no longer count towards progress. A throwing guard leaves the status unchanged and is reported via `onError`.
  - A completed wizard now marks its final step `"completed"`, so `progress.percentage` reaches 100.
  - Completion order is now `definition.onComplete` → state change → plugin `onComplete` (dispatched synchronously) → `events.onComplete`. Unmounting inside `onComplete` no longer makes the analytics plugin report a drop-off for a completed wizard.
  - `StepBuilder.required()` accepts the options object its docs show (`required("email", { messages: { … } })`).

  `@gooonzick/wizard-state`:

  - Navigation state now refreshes on history-only changes (e.g. `clearHistory()`).
  - Errors thrown by guards/resolvers during navigation computation are reported via the new `onError` constructor option (`console.error` fallback) instead of being swallowed.
  - New `createMachineAndManager()` and `createWizardActions()` helpers shared by all bindings.
  - `isLastStep`/`canGoNext` are seeded synchronously from `snapshot.progress.isLastStep` (re-seeded on step change), so UIs no longer flash "Finish" on the first step before the async navigation compute resolves.

  Bindings (React, Vue, Svelte, Solid):

  - Loading flags are reference-counted in every binding: a double-clicked Next no longer clears `isNavigating` while the first navigation is still running. Vue's `loading` slice now reflects the manager's loading state.
  - `reset()` with no argument after `reset(data)` now resets to `data` (the machine's documented baseline), matching `cancel()`, instead of reverting to the original `initialData`.
  - Vue: `ref()`/`reactive()` values passed as `initialData` or to `setData`/`reset`/`restore`/`updateField`/`updateData` are deeply unwrapped instead of crashing with `DataCloneError`.
  - Vue: the user's `onStateChange` now also receives constructor-time emissions, and `reset()`/`restore()` failures reach `onError` one microtask later (still never thrown), matching the other bindings.

## 1.10.0

### Minor Changes

- 5154f2e: Isolate `onStateChange` subscriber errors. A throwing `onStateChange` subscriber (a user callback or a framework binding's listener) is now reported through `onError` (and plugin `onError` with the new `ErrorContext.phase` value `"state"`) instead of throwing into the machine and rejecting the in-flight operation (`goNext()`, `updateField`, etc.), matching how `onDataChange` subscriber errors are already handled.

  **Behaviour change:** code that relied on `goNext()` rejecting when an `onStateChange` callback throws must read the error from `onError`; plugins with an exhaustive `switch` on `ErrorContext.phase` need a `"state"` case.

  Relatedly, a throwing `onStateChange` during `validate()` or first-step initialization is no longer misreported as a validation failure (phase `"validation"`, forcing `valid: false`) or a lifecycle error (phase `"lifecycle"`); it is reported with phase `"state"` and the validation result / initialization stands.

- 5154f2e: Add `WizardStateManager.trackLoading(flag, fn)`, a reference-counted way to toggle loading flags, and use it in `@gooonzick/wizard-solid` so overlapping or rejected operations (a double-clicked Next rejected as busy, concurrent `validate()`/`validateAll()`, `cancel()` mid-transition) no longer clear another operation's `isNavigating`/`isValidating`/`isSubmitting` early. `reset()`/`restore()`/`cancel()` still force all flags off.
- 5154f2e: Add `@gooonzick/wizard-solid` (WIZ-015): a Solid.js 1.x binding. `createWizard()` returns
  flat reactive getters (`wizard.currentStepId`, `wizard.canGoNext`, ...) backed by one signal
  per state-manager channel, refreshed atomically in a single `batch()`; slice getters;
  `actions`; `wizard.field(key)` two-way bindings routed through `machine.updateField`;
  `WizardProvider` / `useWizardContext` / `hasWizardContext`; and owner-aware teardown
  (`onCleanup` when created under a Solid owner). A `createEffect` that throws while the
  wizard updates its signals is reported to `onError` instead of breaking the transition.

  All packages are released together at the same fixed version.

## 1.9.0

### Minor Changes

- 7bdd065: Add `@gooonzick/wizard-svelte` (WIZ-014): a Svelte binding with two layers — a classic
  store API (`createWizardStore`, works on Svelte 4 and 5) on the main entry, and a Svelte 5
  runes API (`createWizard`) on the `@gooonzick/wizard-svelte/runes` subpath. Both expose the
  same flat reactive surface (`$wizard.currentStepId`, `$wizard.canGoNext`, ...), per-channel
  sub-stores/slices, `wizard.field(key)` two-way bindings routed through
  `machine.updateField`, context helpers, and manager-owned loading flags.

  All packages are released together at the same fixed version.

### Patch Changes

- bc9232a: Fix two binding bugs found while implementing WIZ-014's Svelte parity audit:

  - `@gooonzick/wizard-react`'s granular `useWizardActions().updateField` (from
    `use-wizard-granular.tsx`) went through `updateData` instead of calling
    `machine.updateField` directly, losing the WIZ-010 `Object.is` no-op guard and the
    authoritative `changedFields = [field]`. It now calls `machine.updateField` directly,
    matching `useWizard()`'s main hook, Vue, and Svelte. **Technically observable:** a
    same-value `updateField` through the granular hook no longer emits `onStateChange` (it
    already emitted no `onDataChange`).
  - `@gooonzick/wizard-react`'s `reset`/`restore` (`use-wizard.tsx` and
    `use-wizard-granular.tsx`) were fire-and-forget with no `.catch()`, so a malformed
    `restore()` payload (`WizardRestoreError`) became an unhandled promise rejection instead
    of reaching `onError`. `@gooonzick/wizard-vue`'s `reset`/`restore` had the same underlying
    gap, manifesting as an uncaught synchronous throw instead. Both now forward the error to
    `onError`, matching `@gooonzick/wizard-svelte`'s existing behavior.

    **Behavior change for Vue consumers:** `wizard.actions.restore(bad)` / `reset(bad)` no
    longer throw synchronously, so an existing
    `try { wizard.actions.restore(bad) } catch { ... }` will stop firing — there is no
    compile or runtime error, the catch block simply never runs. Read the failure from
    `onError` instead. Vue's `reset`/`restore` still call the machine directly and mirror
    the loading flags locally (they deliberately do not route through
    `manager.runReset`/`runRestore`); only error routing changed.

  All packages are released together at the same fixed version.

## 1.8.0

### Minor Changes

- 818d723: Add built-in `createPersistencePlugin` plus `localStorageAdapter` / `sessionStorageAdapter`
  (WIZ-006): auto-restores a stored snapshot on init, debounced auto-save on data changes and
  committed transitions, clear-on-complete/reset, flush-on-destroy, and an async-first
  `WizardPersistenceAdapter` contract. `WizardMachineReadonly` gains optional `serialize`,
  `restore` and `isBusy` members so plugins can drive persistence. Exported from the main
  barrel and the `/plugins` subpath alongside `createLoggingPlugin` and `createAnalyticsPlugin`.

  All packages are released together at the same fixed version.

## 1.7.0

### Minor Changes

- f2d0d21: Add built-in `createAnalyticsPlugin` (WIZ-016): auto-times steps, counts backtracks, records
  drop-off on destroy, fires `onStepView`/`onStepComplete`/`onWizardComplete`/`onDropOff`/
  `onBacktrack` callbacks, and exposes `getReport()`. Exported from the main barrel and the
  `/plugins` subpath alongside `createLoggingPlugin`.

  All packages are released together at the same fixed version.

## 1.6.0

### Minor Changes

- a4bec60: Add `onDataChange` event, `watchField(field, cb)` method, and the `onDataChange` plugin hook (WIZ-010). Fired on data mutations (updateField/updateData/setData) with shallow-diffed `changedFields`; not fired on reset/restore. Plugin hook payloads are DeepReadonly; subscriber errors are isolated and routed to onError (phase "data").

## 1.5.1

### Patch Changes

- 4badcb0: Guard concurrency and resolver safety in the wizard machine:

  - submit() now acquires the busy lock atomically and rejects a concurrent submit()/goNext() (WizardNavigationError, reason 'busy'), so onSubmit runs exactly once.
  - goNext() broadcasts onStateChange after writing an 'error' step status.
  - Synchronous throws in user when/resolve/enabled callbacks are caught (reported deferred + deduped) and no longer break snapshot/serialize; isLastStep is now false (not true) when the next step is resolved asynchronously.
  - A throwing onEnter emits the committed target snapshot before the error propagates.
  - validate() is generation-guarded so a slow validation can't clobber freshly reset() state.
  - Hygiene: snapshot.progress is frozen; restore()'s background validate() has a catch; setData clones its input.

  Note: submit()-while-busy now rejects instead of running, and isLastStep reports false for async-resolved next steps — behavior changes that fix double-submit and premature 'Finish' bugs respectively.

## 1.5.0

### Minor Changes

- e62eb60: feat: add a plugin system (WIZ-007)

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

  All navigation (`goNext`, `goTo`, `goPrevious`, `goBack`) now defers its step-history and step-status mutations until after `beforeTransition`, so a vetoed transition leaves step history, the current step, and step statuses completely unchanged. As part of unifying this path, `goBack(n)` now marks the departing step `"visited"`, matching `goPrevious` (previously `goBack` did not). React teardown is also hardened against React StrictMode's mount→unmount→remount probe: a manager destroyed by the probe is transparently recreated (with the same plugins) on remount.

- c82bd9e: feat: add validateAll for validating every step at once (WIZ-008)

  Add `WizardMachine.validateAll(options?)` which runs the validator of every
  **enabled** step and returns a structured `ValidationSummary` (per-step results
  plus `valid`, `firstInvalidStepId`, and `invalidStepIds` in definition order).
  Useful on a final "Review/Summary" step to show which earlier steps still have
  errors and to jump straight to the first invalid one.
  - Dry-run by default: it does NOT mutate `stepStatuses`, `isValid`, or
    `validationErrors`, fires no `onValidation`/`onStateChange`, and is fully
    isolated from the plugin system (a thrown validator is caught and reported as
    `{ _error: <message> }` on that step, without dispatching `onError`).
  - Steps without a validator count as valid; disabled steps (static `false` or a
    guard resolving to false) are skipped entirely.
  - With `updateStatuses: true`, invalid steps are marked `"error"` in a single
    state write that emits exactly one `onStateChange`.
  - Exposed on the `actions` slice of the React and Vue hooks
    (`actions.validateAll(...)`); toggles `isValidating` for the duration.
  - New exported types: `ValidationSummary` and `StepValidationSummary`.

## 1.4.0

### Minor Changes

- 39c6e9c: feat: implement Progress API for wizard state tracking
- 8509af5: feat: add state persistence and harden the progress/reset/cancel APIs

  Add state persistence to `WizardMachine` via `serialize(): WizardSerializedState<T>`
  and `restore(state)`, surfaced through the React and Vue bindings. `WizardSerializedState`,
  `WizardProgress`, and `WizardRestoreError` are now re-exported from
  `@gooonzick/wizard-react` and `@gooonzick/wizard-vue`.

  Correctness improvements to the progress/reset/cancel/restore behavior:
  - `cancel()` now always resets to the initial state, even when an `onCancel`
    handler throws.
  - `reset()`/`cancel()` no longer corrupt an in-flight async transition (they
    abort the superseded transition instead of letting it write stale state).
  - Navigating backward keeps a step's `"completed"` status, so progress no
    longer regresses.
  - `restore()` validates the serialized `data`, preserves serialized step
    statuses, aligns `canGoBack` with the first-step rule, and re-validates the
    restored step.
  - `reset()` emits a follow-up state change once the initial step's async
    `onEnter` resolves.
  - `progress.isFirstStep`/`isLastStep` now use the navigation-graph definition
    (consistent across core, the state manager, React, and Vue);
    `progress.currentStepIndex` is `-1` when the current step is skipped.
  - Snapshots are frozen to prevent accidental mutation of machine state, and
    computed progress / `getSnapshot()` are memoized for stable references.

- 1f8a07a: feat: add cancel functionality

## 1.3.0

### Minor Changes

- bca0f5b: feat: add steps status tracking

## 1.2.0

### Minor Changes

- 40c1331: feat: add arbitrary navigation

## 1.1.0

### Minor Changes

- eea4412: feat: add history navigation to wizard

## 1.0.2

### Patch Changes

- 9cb311e: typescript fixes

## 1.0.1

### Patch Changes

- 30ad8e0: add useWizardField composable for v-model bindings

## 1.0.0

### Major Changes

- 889d804: version 1 release
