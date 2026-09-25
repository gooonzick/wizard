# @gooonzick/wizard-solid-example

A deliberately minimal Vite + Solid app demonstrating
[`@gooonzick/wizard-solid`](../../packages/solid).

```bash
pnpm --filter @gooonzick/wizard-solid-example dev
pnpm --filter @gooonzick/wizard-solid-example build
```

## What it shows

| Tab | File | Covers |
| --- | ---- | ------ |
| **createWizard** | `src/BasicExample.tsx` | `createWizard`, reactive getters, `field()` two-way binding, `<Switch>/<Match>` on `currentStepId`, progress, validation errors, `isNavigating`, `submit()`, `reset()` |
| **Context** | `src/ContextExample.tsx` + `src/ContextChild.tsx` | `<WizardProvider>` / `useWizardContext()` — the child binds a field without receiving a single prop |

The wizard definition itself is framework-agnostic and lives in `src/wizard/` (identical to the Svelte example).

## Notes

- **Never mutate `wizard.data.x`.** Snapshots are frozen; bind through `wizard.field(key)`.
- **Do not destructure the wizard** (`const { canGoNext } = wizard`) — it reads once and loses reactivity, like Solid props.
- Each demo creates its wizard inside the component, so unmounting the tab destroys it.
