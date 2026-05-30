# @gooonzick/wizard-state

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
