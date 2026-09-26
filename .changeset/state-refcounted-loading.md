---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-solid": minor
---

Add `WizardStateManager.trackLoading(flag, fn)`, a reference-counted way to toggle loading flags, and use it in `@gooonzick/wizard-solid` so overlapping or rejected operations (a double-clicked Next rejected as busy, concurrent `validate()`/`validateAll()`, `cancel()` mid-transition) no longer clear another operation's `isNavigating`/`isValidating`/`isSubmitting` early. `reset()`/`restore()`/`cancel()` still force all flags off.
