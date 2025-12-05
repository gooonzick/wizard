# WizardForm Documentation

Welcome to the WizardForm framework documentation. This directory contains comprehensive guides for using the `@gooonzick/wizard-core`, `@gooonzick/wizard-react`, and `@gooonzick/wizard-vue` packages.

## Start Here

**New to WizardForm?** Start with the [Getting Started](./getting-started.md) guide for installation and your first wizard.

## Documentation Guide

### For Framework Users

| Guide                                        | Purpose                         | Best For                   |
| -------------------------------------------- | ------------------------------- | -------------------------- |
| [Getting Started](./getting-started.md)      | Installation and quick start    | First-time users           |
| [Core Concepts](./core-concepts.md)          | Understand how WizardForm works | Learning the fundamentals  |
| [Defining Wizards](./defining-wizards.md)    | Different ways to build wizards | Building your first wizard |
| [React Integration](./react-integration.md)  | Using `useWizard()` in React    | React developers           |
| [Vue Integration](../packages/vue/README.md) | Using composables in Vue 3      | Vue developers             |
| [API Reference](./api-reference.md)          | Complete type signatures        | Detailed lookups           |

### Quick Navigation

#### I want to...

- **Get started quickly** → [Getting Started](./getting-started.md)
- **Understand state machines & transitions** → [Core Concepts](./core-concepts.md) - Sections 1, 4
- **Learn validation patterns** → [Core Concepts](./core-concepts.md) - Section 5
- **Build a wizard** → [Defining Wizards](./defining-wizards.md)
- **Use the declarative approach** → [Defining Wizards](./defining-wizards.md) - Section 1
- **Use the builder pattern** → [Defining Wizards](./defining-wizards.md) - Section 2
- **Build a linear flow** → [Defining Wizards](./defining-wizards.md) - Section 3
- **Use WizardForm in React** → [React Integration](./react-integration.md)
- **Use WizardForm in Vue** → [Vue Integration](../packages/vue/README.md)
- **Use organized hook API** → [React Integration](./react-integration.md) - Organized Hook Return Value section
- **Optimize performance with granular hooks** → [React Integration](./react-integration.md) - Granular Hooks section
- **Integrate with React Hook Form** → [React Integration](./react-integration.md) - Common Patterns
- **Look up a type or function** → [API Reference](./api-reference.md)
- **Add custom validation** → [Core Concepts](./core-concepts.md) - Section 5 or [API Reference](./api-reference.md)
- **Use async operations** → [Core Concepts](./core-concepts.md) - Sections 4 & 5
- **Handle errors** → [React Integration](./react-integration.md) - Common Patterns
- **Debug my wizard** → [React Integration](./react-integration.md) - Debugging section

## Package Documentation

The quickest way to get started with each package:

- **@gooonzick/wizard-core**: See [packages/core/README.md](../packages/core/README.md)
- **@gooonzick/wizard-react**: See [packages/react/README.md](../packages/react/README.md)
- **@gooonzick/wizard-vue**: See [packages/vue/README.md](../packages/vue/README.md)

## Core Concepts at a Glance

### State Machine

WizardForm is built on finite state machine principles. Your wizard has defined steps and transitions between them.

### Declarative

Define wizards as data, not imperative code. Wizards are easy to serialize, test, and reason about.

### Type Safe

Full TypeScript support with generics. Your data type flows through the entire API.

### Three Transition Types

- **Static**: Always go to the same step
- **Conditional**: Branch based on data
- **Resolver**: Dynamic resolution via async logic

### Validation

Field-level validation with built-in utilities, schema support, and custom predicates. Supports both sync and async.

### Extensible

Use context to pass APIs, loggers, and routers to validators and lifecycle hooks.

## Common Patterns

### Simple Linear Wizard

```typescript
const wizard = createLinearWizard({
  id: "signup",
  steps: [
    { id: "name", validate: (d) => ({ valid: !!d.name }) },
    { id: "email", validate: (d) => ({ valid: !!d.email }) },
  ],
});
```

### With Conditional Branching

```typescript
const wizard = createWizard()
  .step("plan", (s) =>
    s.nextWhen([
      { when: (d) => d.isPremium, to: "premium-setup" },
      { when: () => true, to: "basic-setup" },
    ]),
  )
  .build();
```

### In React

```tsx
const { state, navigation, actions } = useWizard({
  definition,
  initialData,
  onComplete: (data) => console.log("Done!", data),
});

return (
  <div>
    <h2>{state.currentStep.meta?.title}</h2>
    <button onClick={() => navigation.goNext()}>Next</button>
  </div>
);
```

### In Vue

```vue
<script setup>
import { useWizard } from "@gooonzick/wizard-vue";

const { state, navigation, actions } = useWizard({
  definition,
  initialData: { name: "" },
});
</script>

<template>
  <div>
    <h2>{{ state.currentStep.value?.title }}</h2>
    <button @click="navigation.goNext">Next</button>
  </div>
</template>
```

## Choosing an Approach

| Approach        | Complexity | Flexibility | Best For                               |
| --------------- | ---------- | ----------- | -------------------------------------- |
| Linear Helper   | Minimal    | None        | Simple 2-3 step flows                  |
| Builder Pattern | Low-Medium | High        | Most use cases                         |
| Declarative     | Medium     | Very High   | Complex logic, server-side definitions |

## TypeScript Support

Everything in WizardForm is generic over your data type:

```typescript
type MyData = { name: string; email: string };

const wizard: WizardDefinition<MyData> = { /* ... */ };
const machine: WizardMachine<MyData> = new WizardMachine(wizard, ...);
const form = useWizard<MyData>({ definition, initialData });
```

TypeScript will catch data shape mismatches and provide autocomplete.

## API Overview

### Main Classes

- **WizardMachine** - State machine orchestrating navigation and validation
- **StepBuilder** - Fluent API for building steps
- **WizardBuilder** - Fluent API for building wizards

### Main Functions

- **createStep()** - Create a step builder
- **createWizard()** - Create a wizard builder
- **createLinearWizard()** - Helper for linear flows
- **combineValidators()** - Combine multiple validators
- **requiredFields()** - Create required field validator
- **createStandardSchemaValidator()** - Wrap schema validators
- **andGuards(), orGuards(), notGuard()** - Guard combinators

### Main Types

- **WizardDefinition<T>** - Complete wizard configuration
- **WizardStepDefinition<T>** - Single step definition
- **WizardState<T>** - Current wizard state
- **Validator<T>** - Validation function type
- **StepGuard<T>** - Guard function type
- **StepTransition<T>** - Navigation instruction

See [API Reference](./api-reference.md) for complete documentation.

## Framework Agnostic

`@gooonzick/wizard-core` works with any JavaScript/TypeScript framework:

- React (with `@gooonzick/wizard-react`)
- Vue 3 (with `@gooonzick/wizard-vue`)
- Svelte
- Angular
- Vanilla JS/TS

## No Dependencies

The core library has **zero runtime dependencies**. Optional schema validation requires Standard Schema implementations (Valibot, ArkType, etc.).

## Performance

- Wizards are optimized for fast navigation
- Validation runs only when needed
- State updates are minimal
- Memoization can be used in React components

## Need Help?

1. Check [Core Concepts](./core-concepts.md) for fundamentals
2. Look for your use case in [Defining Wizards](./defining-wizards.md)
3. If using React, check [React Integration](./react-integration.md)
4. Search the [API Reference](./api-reference.md) for specific types/functions
5. Check existing examples in the codebase

## Contributing

If you find issues with the documentation or have suggestions, please open an issue or pull request.

## License

All documentation is under the same license as the source code.
