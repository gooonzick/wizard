# Wizard API Reference

## Table of Contents

- Core packages and primary exports
- Transition and guard patterns
- Validation patterns
- Framework adapter surface
- Typical implementation snippets

## Core Packages and Primary Exports

Use public exports from `@gooonzick/wizard-core`:

- Builders: `createWizard`, `createLinearWizard`, `createStep`
- Machine: `WizardMachine`, `WizardEvents`, `WizardState`
- Data-change API (WIZ-010): `WizardMachine.updateField(field, value)` (Object.is no-op guard),
  `WizardMachine.watchField(field, cb)` (returns an unsubscribe fn; core-only, not exposed via hooks),
  and the `WizardEvents.onDataChange(prev, next, changedFields)` event.
- Transitions: `resolveTransition`, `andGuards`, `orGuards`, `notGuard`, `evaluateGuard`
- Validators: `requiredFields`, `combineValidators`, `createValidator`, `createStandardSchemaValidator`
- Built-in plugins: `createLoggingPlugin` (reference logger) and
  `createAnalyticsPlugin` (auto step-timing / backtrack / drop-off collector with a
  synchronous `getReport(): AnalyticsReport`). Both are re-exported from the main
  barrel and from the `@gooonzick/wizard-core/plugins` subpath.
- Types: `WizardData`, `WizardDefinition`, `WizardStepDefinition`, `StepTransition`, `WizardContext`

Prefer building on exported APIs over importing deep internal modules.

The React and Vue adapters additionally re-export state-layer types from
`@gooonzick/wizard-state` for typing consumers: both expose `StateSnapshot`,
`LoadingState`, `NavigationState`, `ValidationState`, and `SubscriptionChannel`
(alongside `WizardStateManager`). Prefer these public re-exports over importing the
state package directly.

## Transition and Guard Patterns

`StepTransition<T>` supports exactly three transition kinds:

1. Static:

```ts
next: { type: "static", to: "shipping" }
```

2. Conditional:

```ts
next: {
	type: "conditional",
	branches: [
		{ when: (data) => Boolean(data.isBusiness), to: "business" },
		{ when: () => true, to: "personal" },
	],
}
```

3. Resolver:

```ts
next: {
	type: "resolver",
	resolve: async (data, ctx) => {
		const policy = await ctx.policyClient.getRoute(data);
		return policy.nextStep;
	},
}
```

Guard contract:

- Signature: `(data, ctx) => boolean | Promise<boolean>`
- Keep guards free of side effects.

## Validation Patterns

Compose validators instead of embedding large monolithic validate functions:

```ts
validate: combineValidators(
  requiredFields("email", "name"),
  createValidator(
    (data) => String(data.email).includes("@"),
    "Email is invalid",
    "email",
  ),
);
```

Use `createStandardSchemaValidator()` for Standard Schema compatible validators.

## Framework Adapter Surface

React (`@gooonzick/wizard-react`) and Vue (`@gooonzick/wizard-vue`) expose aligned slices
via the main composable/hook `useWizard`:

- `state`
- `validation`
- `navigation`
- `loading`
- `actions`

Both adapters also expose granular hooks/composables for fine-grained subscriptions:
`useWizardData`, `useWizardNavigation`, `useWizardValidation`, `useWizardLoading`,
`useWizardActions`, and `useWizardField`.

`useWizardField` is a controlled single-field binding with two overloads — provider
mode `useWizardField(field)` (inside `<WizardProvider>`) and direct mode
`useWizardField(wizard, field)`. In React it returns a `[value, setValue]` tuple; in
Vue it returns a `WritableComputedRef` for `v-model`. Hooks-rules caveat: a single
call site must not switch between provider and direct mode across renders.

When changing wizard behavior, verify these slices/hooks still return expected semantics.

Both adapters' `useWizard` (and `<WizardProvider>`) accept an `onDataChange`
option — `(prevData, nextData, changedFields) => void` (plain `T` params) — that
fires on data mutations. `actions.updateField` delegates to the core
`updateField` (Object.is no-op). `watchField` is core-only and is NOT part of the
adapter surface.

## Typical Implementation Snippets

### Build a definition and run machine

```ts
import { requiredFields } from "@gooonzick/wizard-core";
import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";

type FormData = {
  name: string;
  email: string;
};

const definition = createLinearWizard<FormData>({
  id: "signup",
  steps: [
    { id: "name", validate: requiredFields<FormData>("name") },
    { id: "email", validate: requiredFields<FormData>("email") },
  ],
});

const machine = new WizardMachine(definition, {}, { name: "", email: "" });
await machine.goNext();
```

### Extend with context

```ts
const machine = new WizardMachine(
  definition,
  { debug: true, apiClient },
  initialData,
);
```

Use context for external dependencies instead of hard-coding globals in guards/resolvers.

### Data update semantics

- `setData(data)` deep-CLONES its argument (matching constructor / `reset` /
  `serialize`), so mutating the object you passed afterward does NOT retroactively
  mutate wizard state.
- `updateData(updater)` takes an `(data) => data` updater and uses its return value
  directly (documented in/out contract) — it does NOT clone.
- `updateField(field, value)` updates one top-level field with an `Object.is`
  no-op guard: setting a field to its current value does nothing (no
  `onStateChange`, no `onDataChange`). Produces `changedFields = [field]`.
- `onDataChange(prevData, nextData, changedFields)` (a `WizardEvents` member)
  fires AFTER `onStateChange` on any `updateField`/`updateData`/`setData` that
  changes ≥1 top-level field. `changedFields` is a shallow (`Object.is`) diff of
  top-level keys. NOT fired on `reset()`, `restore()`, or navigation. Handler
  errors are isolated and routed to `onError` with `phase: "data"`.
- `watchField(field, cb)` subscribes to a single field, calls back with
  `(newValue, oldValue)`, and returns an unsubscribe function. Core-only.
- Plugin hook `onDataChange(prevData, nextData, changedFields)` (DeepReadonly
  payloads, fire-and-forget, errors → `onError` phase "data") is part of
  `WizardPlugin` (WIZ-010). `ErrorContext.phase` now includes `"data"`.
- `snapshot`, its `stepStatuses`, and `snapshot.progress` (with its `enabledStepIds`
  array) are frozen; `snapshot.data` is intentionally NOT frozen.

### Built-in analytics plugin (WIZ-016)

- `createAnalyticsPlugin<TData>(config?)` returns
  `AnalyticsPlugin<TData> = WizardPlugin<TData> & { getReport(): AnalyticsReport }`.
- Optional callbacks: `onStepView(stepId, data)`, `onStepComplete(stepId, ms)`,
  `onBacktrack(from, to)`, `onWizardComplete(data, totalMs)`,
  `onDropOff(stepId, ms)`. Injectable clock via `now` (default `Date.now`).
- Timing: a step's timer closes on `afterTransition` (terminal step in `onComplete`);
  `getReport()` folds the current step's still-open visit into `stepTimings` and
  `totalDuration`.
- Backtrack = a `previous` transition OR a `goTo` to an already-viewed step.
- `onDropOff` fires from `destroy()` ONLY when the wizard never completed.
- Bookkeeping runs before user callbacks, so a throwing callback cannot corrupt the
  report. `onReset` restarts the session in place and does NOT re-emit `onStepView`.
- Register like any plugin: `machine.use(analytics)` or the `plugins` option in
  `useWizard` / `WizardProvider`.

## Installation Quick Reference

Use package-manager equivalents as needed:

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react @gooonzick/wizard-vue
```

Install only the adapters your project uses.
