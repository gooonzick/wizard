---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-svelte": minor
"@gooonzick/wizard-vue": minor
---

Add `@gooonzick/wizard-svelte` (WIZ-014): a Svelte binding with two layers — a classic
store API (`createWizardStore`, works on Svelte 4 and 5) on the main entry, and a Svelte 5
runes API (`createWizard`) on the `@gooonzick/wizard-svelte/runes` subpath. Both expose the
same flat reactive surface (`$wizard.currentStepId`, `$wizard.canGoNext`, ...), per-channel
sub-stores/slices, `wizard.field(key)` two-way bindings routed through
`machine.updateField`, context helpers, and manager-owned loading flags.

All packages are released together at the same fixed version.
