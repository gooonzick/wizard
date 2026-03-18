# Vue Examples

This example app demonstrates three ways to build with `@gooonzick/wizard-vue`.

## Available Tabs

- `useWizard`: a standalone wizard with the full adapter return value in one component tree.
- `Provider`: a provider-based example using granular hooks in nested components.
- `useWizardField`: a focused `v-model` example showing writable field bindings without mirroring wizard state into a second reactive object.

## Run The Example

```sh
pnpm --filter @gooonzick/wizard-vue-examples dev
```

## Build And Verify

```sh
pnpm --filter @gooonzick/wizard-vue-examples typecheck
pnpm --filter @gooonzick/wizard-vue-examples build-only
pnpm --filter @gooonzick/wizard-vue-examples lint
```
