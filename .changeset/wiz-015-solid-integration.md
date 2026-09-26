---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-solid": minor
---

Add `@gooonzick/wizard-solid` (WIZ-015): a Solid.js 1.x binding. `createWizard()` returns
flat reactive getters (`wizard.currentStepId`, `wizard.canGoNext`, ...) backed by one signal
per state-manager channel, refreshed atomically in a single `batch()`; slice getters;
`actions`; `wizard.field(key)` two-way bindings routed through `machine.updateField`;
`WizardProvider` / `useWizardContext` / `hasWizardContext`; and owner-aware teardown
(`onCleanup` when created under a Solid owner). A `createEffect` that throws while the
wizard updates its signals is reported to `onError` instead of breaking the transition.

All packages are released together at the same fixed version.
