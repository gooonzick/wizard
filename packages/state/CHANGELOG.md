# @gooonzick/wizard-state

## 1.6.0

### Patch Changes

- Updated dependencies [a4bec60]
  - @gooonzick/wizard-core@1.6.0

## 1.5.1

### Patch Changes

- 4badcb0: Fix asynchronous navigation-state recompute in WizardStateManager:

  - availableSteps changes are now included in change detection (content equality), so availableSteps-only updates are no longer dropped.
  - A trailing recompute is scheduled when requests arrive mid-flight, so navigation state reflects the last edit after rapid updates.
  - destroy() now clears caches/subscribers and ignores an in-flight recompute so notifications can't fire post-destroy.

- Updated dependencies [4badcb0]
  - @gooonzick/wizard-core@1.5.1

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

### Patch Changes

- Updated dependencies [e62eb60]
- Updated dependencies [c82bd9e]
  - @gooonzick/wizard-core@1.5.0

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

### Patch Changes

- Updated dependencies [39c6e9c]
- Updated dependencies [8509af5]
- Updated dependencies [1f8a07a]
  - @gooonzick/wizard-core@1.4.0

## 1.3.0

### Minor Changes

- bca0f5b: feat: add steps status tracking

### Patch Changes

- Updated dependencies [bca0f5b]
  - @gooonzick/wizard-core@1.3.0

## 1.2.0

### Minor Changes

- 40c1331: feat: add arbitrary navigation

### Patch Changes

- Updated dependencies [40c1331]
  - @gooonzick/wizard-core@1.2.0

## 1.1.0

### Minor Changes

- eea4412: feat: add history navigation to wizard

### Patch Changes

- Updated dependencies [eea4412]
  - @gooonzick/wizard-core@1.1.0

## 1.0.2

### Patch Changes

- 9cb311e: typescript fixes
- Updated dependencies [9cb311e]
  - @gooonzick/wizard-core@1.0.2

## 1.0.1

### Patch Changes

- 30ad8e0: add useWizardField composable for v-model bindings
- Updated dependencies [30ad8e0]
  - @gooonzick/wizard-core@1.0.1

## 1.0.0

### Major Changes

- 889d804: version 1 release

### Patch Changes

- Updated dependencies [889d804]
  - @gooonzick/wizard-core@1.0.0
