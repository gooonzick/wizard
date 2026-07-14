# Vue Examples

Demo app for `@gooonzick/wizard-core` + `@gooonzick/wizard-vue`.

## Available Demos

Switch approaches in the app UI:

| Approach | File | What it shows |
| --- | --- | --- |
| **useWizard** | `src/wizard-example/use-wizard-example.vue` | Full composable API, **`actions.validateAll()`** on review |
| **Provider** | `src/wizard-example/provider-example.vue` | `WizardProvider` / `createTypedWizardProvider` + granular composables |
| **useWizardField** | `src/wizard-example/field-binding-example.vue` | `v-model` via `useWizardField()` without a second reactive store |
| **History** | `src/wizard-example/history-example.vue` | Conditional branching + history stack |
| **Reset & Cancel** | `src/wizard-example/reset-cancel-example.vue` | `reset` / `cancel` and lifecycle events |
| **Persistence** | `src/wizard-example/state-persistence-example.vue` | `serialize` / `restore` with `localStorage` |
| **Plugins** | `src/wizard-example/plugins-example.vue` | `createLoggingPlugin` + custom `afterTransition` / `onError` plugin |

Shared definition/helpers live under `src/wizard-example/` (`wizard-definition.ts`, validators, guards).

## Run

```sh
pnpm --filter @gooonzick/wizard-vue-examples dev
```

## Build And Verify

```sh
pnpm --filter @gooonzick/wizard-vue-examples typecheck
pnpm --filter @gooonzick/wizard-vue-examples build-only
pnpm --filter @gooonzick/wizard-vue-examples lint
```
