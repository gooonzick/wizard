---
"@gooonzick/wizard-react": patch
"@gooonzick/wizard-vue": patch
---

Docs: fix README snippets whose Next button was disabled on `!canGoNext`, which made the last step impossible to finish. The buttons now disable only while navigating and read "Finish" on the last step (`goNext()` completes the wizard there). The Vue granular-composable snippet also no longer reads `.value` on auto-unwrapped template refs.
