---
"@gooonzick/wizard-state": patch
"@gooonzick/wizard-svelte": patch
"@gooonzick/wizard-solid": patch
---

Docs: update the READMEs to the 1.11.0 navigation behaviour. `canGoNext`/`isLastStep` are now seeded synchronously (no "optimistically wrong first snapshot"), and the Svelte/Solid Quick Starts no longer disable Next on `!canGoNext`, which made the last step impossible to finish.
