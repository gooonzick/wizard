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
- Transitions: `resolveTransition`, `andGuards`, `orGuards`, `notGuard`, `evaluateGuard`
- Validators: `requiredFields`, `combineValidators`, `createValidator`, `createStandardSchemaValidator`
- Types: `WizardData`, `WizardDefinition`, `WizardStepDefinition`, `StepTransition`, `WizardContext`

Prefer building on exported APIs over importing deep internal modules.

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

React (`@gooonzick/wizard-react`) and Vue (`@gooonzick/wizard-vue`) expose aligned slices:

- `state`
- `validation`
- `navigation`
- `loading`
- `actions`

When changing wizard behavior, verify these slices still return expected semantics.

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

## Installation Quick Reference

Use package-manager equivalents as needed:

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react @gooonzick/wizard-vue
```

Install only the adapters your project uses.
