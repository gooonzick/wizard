---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-vue": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-solid": minor
---

Isolate `onStateChange` subscriber errors. A throwing `onStateChange` subscriber (a user callback or a framework binding's listener) is now reported through `onError` (and plugin `onError` with the new `ErrorContext.phase` value `"state"`) instead of throwing into the machine and rejecting the in-flight operation (`goNext()`, `updateField`, etc.), matching how `onDataChange` subscriber errors are already handled.

**Behaviour change:** code that relied on `goNext()` rejecting when an `onStateChange` callback throws must read the error from `onError`; plugins with an exhaustive `switch` on `ErrorContext.phase` need a `"state"` case.

Relatedly, a throwing `onStateChange` during `validate()` or first-step initialization is no longer misreported as a validation failure (phase `"validation"`, forcing `valid: false`) or a lifecycle error (phase `"lifecycle"`); it is reported with phase `"state"` and the validation result / initialization stands.
