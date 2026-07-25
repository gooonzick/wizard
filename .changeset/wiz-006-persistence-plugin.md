---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-state": minor
---

Add built-in `createPersistencePlugin` plus `localStorageAdapter` / `sessionStorageAdapter`
(WIZ-006): auto-restores a stored snapshot on init, debounced auto-save on data changes and
committed transitions, clear-on-complete/reset, flush-on-destroy, and an async-first
`WizardPersistenceAdapter` contract. `WizardMachineReadonly` gains optional `serialize`,
`restore` and `isBusy` members so plugins can drive persistence. Exported from the main
barrel and the `/plugins` subpath alongside `createLoggingPlugin` and `createAnalyticsPlugin`.

All packages are released together at the same fixed version.
