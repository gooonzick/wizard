---
"@gooonzick/wizard-core": minor
---

Add built-in `createAnalyticsPlugin` (WIZ-016): auto-times steps, counts backtracks, records
drop-off on destroy, fires `onStepView`/`onStepComplete`/`onWizardComplete`/`onDropOff`/
`onBacktrack` callbacks, and exposes `getReport()`. Exported from the main barrel and the
`/plugins` subpath alongside `createLoggingPlugin`.
