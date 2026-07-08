---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-state": minor
---

feat: add validateAll for validating every step at once (WIZ-008)

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
