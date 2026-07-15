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

Do not re-implement machine behavior in React/Vue adapters.

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
4. Documentation and examples that expose callbacks

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

## Compatibility Checklist

Before finishing a change:

- Confirm public API exports remain coherent for consumers.
- Confirm React and Vue adapters still compile and expose stable slices.
- Confirm changes do not require consumers to import internal paths.
- Confirm type constraints remain `T extends WizardData` patterns.

## Testing Checklist

Run focused tests first (examples):

- Run transition-focused tests.
- Run validator-focused tests.
- Run adapter tests for React/Vue where affected.

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
