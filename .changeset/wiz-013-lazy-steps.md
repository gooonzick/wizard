---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-solid": minor
---

Add lazy steps (WIZ-013). A step can load its implementation — `validate`, `onEnter`, `onLeave`, `onSubmit` — on first use via `load: () => import("./step")` or `StepBuilder.lazy()`, while its transitions, `enabled` guard and `meta` stay eager (so progress, `isLastStep` and disabled-step skipping never wait for a load). Loads are cached per machine, shared between concurrent callers and retried after a failure. A loaded implementation's hooks must be functions (a non-function hook is a load error), and an object `default` export wins over named exports.

- `WizardState.isLoadingStep` is `true` while the current or target step loads; `@gooonzick/wizard-state` mirrors it into the loading slice (`TrackedLoadingFlag` keeps `trackLoading("isLoadingStep")` a type error), and React, Vue, Svelte (stores + runes) and Solid expose it next to `isNavigating`.
- `machine.preloadStep(stepId)` / `actions.preloadStep(stepId)` prefetch a step without navigating. The returned promise belongs to the caller (it is not reported through `onError`), so fire-and-forget calls need `.catch(() => {})`.
- A failed load rejects the operation with the new `WizardStepLoadError` and leaves the wizard on the current step. Each failed attempt is reported once, even when several operations await it.
- Fixed: `validateAll({ updateStatuses: true })` no longer writes step statuses if `reset()`, `cancel()`, `restore()` or `destroy()` happened while it was running. This also fixes the same race for non-lazy wizards with async validators.

**Behaviour change:** load failures are reported through `onError` and plugin `onError` with the new `ErrorContext.phase` value `"load"` — plugins with an exhaustive `switch` on `phase` need a `"load"` case. `WizardState` gains the required `isLoadingStep` field; code that hand-builds `WizardState` objects (test fakes) must add it.
