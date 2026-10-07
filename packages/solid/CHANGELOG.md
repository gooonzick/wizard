# @gooonzick/wizard-solid

## 1.12.0

### Minor Changes

- f162a12: Add lazy steps (WIZ-013). A step can load its implementation — `validate`, `onEnter`, `onLeave`, `onSubmit` — on first use via `load: () => import("./step")` or `StepBuilder.lazy()`, while its transitions, `enabled` guard and `meta` stay eager (so progress, `isLastStep` and disabled-step skipping never wait for a load). Loads are cached per machine, shared between concurrent callers and retried after a failure. A loaded implementation's hooks must be functions (a non-function hook is a load error), and an object `default` export wins over named exports. A hook defined on both the skeleton and the loaded implementation is composed, not replaced: `validate` runs through `combineValidators(skeleton, loaded)` (both must pass, errors merged) and `onEnter` / `onLeave` / `onSubmit` run the skeleton's hook first, then the loaded one — so `.required("passport").lazy(...)` keeps its required check.

  - `WizardState.isLoadingStep` is `true` while the current or target step loads; `@gooonzick/wizard-state` mirrors it into the loading slice (`TrackedLoadingFlag` keeps `trackLoading("isLoadingStep")` a type error), and React, Vue, Svelte (stores + runes) and Solid expose it next to `isNavigating`.
  - `machine.preloadStep(stepId)` / `actions.preloadStep(stepId)` prefetch a step without navigating. The machine's promise belongs to the caller (it rejects on failure and is not reported through `onError`), so fire-and-forget calls on the machine need `.catch(() => {})`; the bindings' `actions.preloadStep` never rejects (failures are reported by the navigation that needs the step), so it is safe in hover/focus handlers. When a background `preloadStep()` / `validateAll()` loads the **current** step, the machine emits one `onStateChange` so bindings refresh `currentStep`.
  - A failed load rejects the navigation / `submit()` with the new `WizardStepLoadError` (`validate()` resolves invalid instead) and leaves the wizard on the current step. Its message is `Failed to load step "<id>": <cause message>` (native `cause` is the original error). Each failed attempt is reported once, even when several operations await it.
  - Leaving a step whose own chunk failed is not blocked: the current step's load is best-effort (for its `onLeave`), only a failing target load blocks. A failed lazy initial step replays its `onEnter` / `onStepEnter` once, the next time it is used — validated by `validate()`, `canSubmit()`, or the validation in `goNext()` / `goTo()` / `submit()`. Lifecycle hooks of a step run only if the step was entered: leaving it without validation (`goPrevious()`, `goTo(id, { skipValidation: true })`) does not load it and skips its `onLeave` and `onStepLeave` (a skeleton `onLeave` on that step does not run in this case); the same applies while its first load is still in flight. An abort during an in-flight `validate()` no longer rejects it — the `AbortSignal` is checked only when a method is called. `validate()` validates the new current step when the user moved during its load, and `canSubmit()` loads a lazy current step in the background.
  - Fixed: `validateAll({ updateStatuses: true })` no longer writes step statuses if `reset()`, `cancel()`, `restore()` or `destroy()` happened while it was running. This also fixes the same race for non-lazy wizards with async validators.

  **Behaviour change:** load failures are reported through `onError` and plugin `onError` with the new `ErrorContext.phase` value `"load"` — plugins with an exhaustive `switch` on `phase` need a `"load"` case. `WizardState` gains the required `isLoadingStep` field, which also appears in `@gooonzick/wizard-state`'s `LoadingState` and the bindings' loading types (React/Vue `UseWizardLoading`, Svelte/Solid `WizardStoreLoading` and the flat wizard objects); code that hand-builds these objects (test fakes) must add it.

### Patch Changes

- Updated dependencies [f162a12]
- Updated dependencies [f162a12]
  - @gooonzick/wizard-state@1.12.0
  - @gooonzick/wizard-core@1.12.0

## 1.11.2

### Patch Changes

- @gooonzick/wizard-core@1.11.2
- @gooonzick/wizard-state@1.11.2

## 1.11.1

### Patch Changes

- da188a9: Docs: update the READMEs to the 1.11.0 navigation behaviour. `canGoNext`/`isLastStep` are now seeded synchronously (no "optimistically wrong first snapshot"), and the Svelte/Solid Quick Starts no longer disable Next on `!canGoNext`, which made the last step impossible to finish.
- Updated dependencies [da188a9]
  - @gooonzick/wizard-state@1.11.1
  - @gooonzick/wizard-core@1.11.1

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
