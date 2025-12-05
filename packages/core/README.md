# @gooonzick/wizard-core

A framework-agnostic, type-safe state machine for building multi-step wizards in TypeScript.

## Features

- **Framework Agnostic** - Use with React, Vue, Svelte, vanilla JS, or any TypeScript project
- **Type Safe** - Full TypeScript generics support for your data types
- **Flexible Navigation** - Static, conditional, or dynamic step transitions
- **Validation** - Built-in validators, schema support, and custom predicates
- **Extensible** - Context, guards, lifecycle hooks, and side effects
- **State Machine** - Predictable behavior based on finite state machine principles
- **Zero Dependencies** - Core library has no external dependencies (only for Standard Schema validation)

## Installation

```bash
npm install @gooonzick/wizard-core
```

## Quick Start

```typescript
import { WizardMachine, createLinearWizard } from "@gooonzick/wizard-core";

// 1. Define your data type
type SignupData = {
  name: string;
  email: string;
};

// 2. Create a wizard
const wizard = createLinearWizard<SignupData>({
  id: "signup",
  steps: [
    {
      id: "name",
      title: "What's your name?",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: data.name ? undefined : { name: "Required" },
      }),
    },
    {
      id: "email",
      title: "What's your email?",
      validate: (data) => ({
        valid: data.email?.includes("@") ?? false,
        errors: data.email?.includes("@")
          ? undefined
          : { email: "Invalid email" },
      }),
      onSubmit: async (data) => {
        console.log("Form submitted:", data);
      },
    },
  ],
  onComplete: (data) => {
    console.log("Wizard complete:", data);
  },
});

// 3. Create a state machine
const machine = new WizardMachine(wizard, {}, { name: "", email: "" });

// 4. Navigate
console.log(machine.snapshot.currentStepId); // "name"
await machine.goNext();
console.log(machine.snapshot.currentStepId); // "email"
```

## Core Concepts

### Declarative Definitions

Define wizards as data, not imperative code:

```typescript
import type { WizardDefinition } from "@gooonzick/wizard-core";

const wizard: WizardDefinition<MyData> = {
  id: "my-wizard",
  initialStepId: "step1",
  steps: {
    step1: {
      /* ... */
    },
    step2: {
      /* ... */
    },
  },
};
```

### State Machine

All navigation and validation goes through `WizardMachine`:

```typescript
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    // React to state changes
  },
});

await machine.goNext();
await machine.validate();
```

### Three Transition Types

Navigate between steps in different ways:

**Static** - Always go to the same step:

```typescript
next: { type: "static", to: "next-step" }
```

**Conditional** - Branch based on data:

```typescript
next: {
  type: "conditional",
  branches: [
    { when: (d) => d.isPremium, to: "premium-path" },
    { when: () => true, to: "standard-path" },
  ],
}
```

**Resolver** - Dynamic resolution with async logic:

```typescript
next: {
  type: "resolver",
  resolve: async (data, ctx) => {
    const plan = await ctx.api.getPlan(data.userId);
    return plan.recommended;
  },
}
```

### Type Safety

Your entire wizard is typed with your data:

```typescript
type CheckoutData = {
  email: string;
  cardNumber: string;
};

const wizard: WizardDefinition<CheckoutData> = {
  // TypeScript ensures all steps match CheckoutData
  steps: {
    payment: {
      validate: (data) => {
        // data is CheckoutData
        data.cardNumber; // ✅ TypeScript knows this exists
        data.unknownField; // ❌ TypeScript error
      },
    },
  },
};
```

## Building Wizards

### With Builders (Recommended)

Use fluent API for readability:

```typescript
import { createWizard } from "@gooonzick/wizard-core";

const wizard = createWizard<SignupData>("signup")
  .initialStep("personal")
  .step("personal", (s) =>
    s.title("Personal Info").required("name").next("contact"),
  )
  .step("contact", (s) =>
    s
      .title("Contact Info")
      .required("email")
      .previous("personal")
      .onSubmit(async (data) => {
        await api.submit(data);
      }),
  )
  .onComplete(async (data) => {
    console.log("Done!");
  })
  .build();
```

### With Raw Definitions

For complex logic or server-side generation:

```typescript
const wizard: WizardDefinition<SignupData> = {
  id: "signup",
  initialStepId: "personal",
  steps: {
    personal: {
      id: "personal",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: data.name ? undefined : { name: "Required" },
      }),
      next: { type: "static", to: "contact" },
    },
    contact: {
      id: "contact",
      validate: (data) => ({
        valid: data.email?.includes("@") ?? false,
        errors: data.email?.includes("@")
          ? undefined
          : { email: "Invalid email" },
      }),
      previous: { type: "static", to: "personal" },
    },
  },
};
```

### For Simple Linear Flows

Use the linear helper:

```typescript
const wizard = createLinearWizard<SignupData>({
  id: "signup",
  steps: [
    { id: "personal", title: "Name", validate: (d) => ({ valid: !!d.name }) },
    { id: "contact", title: "Email", validate: (d) => ({ valid: !!d.email }) },
    { id: "review", title: "Review" },
  ],
  onComplete: (data) => console.log("Done!", data),
});
```

## Validation

### Simple Validators

```typescript
validate: (data) => ({
  valid: data.name?.length > 0,
  errors: data.name?.length > 0 ? undefined : { name: "Required" },
});
```

### Using Utilities

```typescript
import {
  combineValidators,
  requiredFields,
  createValidator,
} from "@gooonzick/wizard-core";

const emailValidator = createValidator(
  (data) => data.email?.includes("@"),
  "Invalid email",
  "email",
);

step.validate = combineValidators(
  requiredFields("name", "email"),
  emailValidator,
);
```

### Schema Validation

```typescript
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";

step.validate = createStandardSchemaValidator(myValibotSchema);
```

### Async Validation

```typescript
validate: async (data, ctx) => {
  const isAvailable = await ctx.api.checkEmail(data.email);
  return {
    valid: isAvailable,
    errors: isAvailable ? undefined : { email: "Already taken" },
  };
};
```

## Navigation

```typescript
const machine = new WizardMachine(definition, context, initialData);

// Move forward
await machine.goNext();

// Move backward
await machine.goPrevious();

// Jump to specific step
await machine.goToStep("step-id");

// Query navigation
const canGo = await machine.canNavigateToStep("step-id");
const nextId = await machine.getNextStepId();
const available = await machine.getAvailableSteps();
```

## Context and Dependencies

Pass utilities to validators and hooks via context:

```typescript
interface MyContext extends WizardContext {
  api: ApiClient;
  logger: Logger;
}

const context: MyContext = {
  api: new ApiClient(),
  logger: console,
};

const machine = new WizardMachine(definition, context, initialData);

// Use in validators
const step = {
  validate: async (data, ctx) => {
    const myCtx = ctx as MyContext;
    const isValid = await myCtx.api.validate(data);
    return { valid: isValid };
  },
};
```

## Events and Reactivity

Subscribe to state changes:

```typescript
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    // Update UI
  },
  onStepEnter: (stepId, data) => {
    // Load data for step
  },
  onValidation: (result) => {
    // Show validation errors
  },
  onComplete: (data) => {
    // Handle completion
  },
  onError: (error) => {
    // Handle errors
  },
});
```

## TypeScript Support

Everything is generic over your data type:

```typescript
// Define once
type SignupData = {
  name: string;
  email: string;
  plan: "basic" | "pro";
};

// Use everywhere
const wizard: WizardDefinition<SignupData> = { /* ... */ };
const machine: WizardMachine<SignupData> = new WizardMachine(wizard, ...);

// Types are inferred
machine.snapshot.data.name; // ✅ Works
machine.snapshot.data.unknown; // ❌ TypeScript error
```

## Documentation

- [Getting Started](../../docs/getting-started.md) - Quick introduction
- [Core Concepts](../../docs/core-concepts.md) - Understand the fundamentals
- [Defining Wizards](../../docs/defining-wizards.md) - Different definition patterns
- [API Reference](../../docs/api-reference.md) - Complete API documentation

## No Dependencies

The core library has **zero dependencies**. Optional schema validation requires Standard Schema implementations like:

- Valibot
- ArkType
- Zod (with adapter)

## License

MIT
