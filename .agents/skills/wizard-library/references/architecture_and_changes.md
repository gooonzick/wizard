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

- Navigation (`goNext`, `goPrevious`, `goBack`, `goToStep`)
- Validation (`validate`, `canSubmit`)
- Completion and lifecycle events
- Busy and abort checks

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
