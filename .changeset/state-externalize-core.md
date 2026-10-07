---
"@gooonzick/wizard-state": patch
---

Stop bundling `@gooonzick/wizard-core` into `@gooonzick/wizard-state`'s build. The published `dist` contained its own copy of `WizardMachine` and the error classes, so every binding (React, Vue, Svelte, Solid) created machines from that copy: `error instanceof WizardValidationError` (or any other core error class imported by the app) was always `false` for errors thrown by a binding-created wizard, and apps shipped core twice. `wizard-state` now imports core like the bindings do.
