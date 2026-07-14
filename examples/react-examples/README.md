# React Examples

Demo app for `@gooonzick/wizard-core` + `@gooonzick/wizard-react`.

## Available Demos

Switch tabs in the app UI:

| Tab | File | What it shows |
| --- | --- | --- |
| **Registration Wizard** | `src/wizard-example.tsx` | Basic multi-step flow, progress, sidebar, **`actions.validateAll()`** on the review step |
| **Provider + Hooks** | `src/provider-example.tsx` | `WizardProvider` + granular hooks (`useWizardData`, `useWizardNavigation`, …) in nested components |
| **Navigation History** | `src/history-example.tsx` | Conditional branching + history stack (`canGoBack`, `stepHistory`, `goPrevious`) |
| **Reset & Cancel** | `src/reset-cancel-example.tsx` | `actions.reset()`, `actions.cancel()`, `onReset` / `onCancel` / definition `.onCancel()` |
| **State Persistence** | `src/state-persistence-example.tsx` | `actions.serialize()` / `actions.restore()` with `localStorage` |
| **Plugins** | `src/plugins-example.tsx` | `createLoggingPlugin` + custom `afterTransition` / `onError` plugin |

Shared definition: `src/registration-wizard.ts`.

## Run

```sh
pnpm --filter @gooonzick/wizard-react-examples dev
```

## Build And Typecheck

```sh
pnpm --filter @gooonzick/wizard-react-examples typecheck
pnpm --filter @gooonzick/wizard-react-examples build
```
