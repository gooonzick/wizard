# @gooonzick/wizard-svelte

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

### Patch Changes

- Updated dependencies [d36dcd5]
  - @gooonzick/wizard-core@1.11.0
  - @gooonzick/wizard-state@1.11.0

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

### Patch Changes

- Updated dependencies [5154f2e]
- Updated dependencies [5154f2e]
- Updated dependencies [5154f2e]
  - @gooonzick/wizard-core@1.10.0
  - @gooonzick/wizard-state@1.10.0

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

- Updated dependencies [bc9232a]
- Updated dependencies [7bdd065]
  - @gooonzick/wizard-core@1.9.0
  - @gooonzick/wizard-state@1.9.0
