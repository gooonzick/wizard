---
"@gooonzick/wizard-state": patch
---

Fix asynchronous navigation-state recompute in WizardStateManager:

- availableSteps changes are now included in change detection (content equality), so availableSteps-only updates are no longer dropped.
- A trailing recompute is scheduled when requests arrive mid-flight, so navigation state reflects the last edit after rapid updates.
- destroy() now clears caches/subscribers and ignores an in-flight recompute so notifications can't fire post-destroy.
