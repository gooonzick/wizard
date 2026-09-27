---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-solid": minor
---

Fix a batch of correctness bugs found in a full-repo review, and move every binding onto shared wiring in `@gooonzick/wizard-state`.

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
