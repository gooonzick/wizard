---
"@gooonzick/wizard-react": patch
"@gooonzick/wizard-vue": patch
---

Binding fixes and API parity:

- Externalize `@gooonzick/wizard-state` in the react/vue builds so consumers share a single `WizardStateManager` identity (previously the class was inlined, breaking `instanceof` across the package boundary). `@gooonzick/wizard-state` is now a genuine runtime import (already a declared dependency).
- React: fix a StrictMode/concurrent-render leak where the wizard machine could be constructed in the render/initializer path and orphaned. The machine is now created via a ref-guarded lazy init with effect-owned teardown.
- React: add `useWizardField` for parity with Vue. Returns a `[value, setValue]` tuple (provider and direct-`useWizard()` call styles).
- Align the root export surface between react and vue: both now re-export `LoadingState`, `NavigationState`, `StateSnapshot`, `SubscriptionChannel`, `ValidationState`, and `WizardStateManager`.
- Add `"sideEffects": false` to both packages for better consumer tree-shaking.
