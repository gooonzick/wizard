# 🧙‍♂️ WizardForm TypeScript Framework

[![CI](https://github.com/gooonzick/wizard/actions/workflows/ci.yml/badge.svg)](https://github.com/gooonzick/wizard/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/gooonzick/wizard/branch/main/graph/badge.svg)](https://codecov.io/gh/gooonzick/wizard)
[![npm version](https://badge.fury.io/js/@gooonzick%2Fwizard-core.svg)](https://www.npmjs.com/package/@gooonzick/wizard-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A declarative, type-safe, and extensible framework for building multi-step wizards in TypeScript.

## ✨ Features

- **Fully Type-Safe**: Complete TypeScript support with generics
- **Declarative API**: Define wizards as data, not imperative logic
- **State Machine Architecture**: Built on finite state machine principles
- **Dynamic Routing**: Support for static, conditional, and resolver-based transitions
- **Navigation History**: Built-in history stack for reliable back navigation through conditional flows
- **Extensible**: Guards, validators, lifecycle hooks, and side effects
- **Framework Agnostic**: Core logic works with any UI framework
- **React Integration**: Ready-to-use React hook included
- **Vue Integration**: Vue 3 Composition API support
- **Builder Pattern**: Fluent API for easy wizard creation

## 📦 Installation

```bash
# Install core package
npm install @gooonzick/wizard-core

# For React integration
npm install @gooonzick/wizard-core @gooonzick/wizard-react

# For Vue integration
npm install @gooonzick/wizard-core @gooonzick/wizard-vue
```

## 🚀 Quick Start

### 1. Define Your Data Type

```typescript
type SignupData = {
  name: string;
  email: string;
  plan: "basic" | "pro";
  needsInvoice: boolean;
  termsAccepted: boolean;
};
```

### 2. Create Wizard Definition (Declarative)

```typescript
import { WizardDefinition } from "@gooonzick/wizard-core";

const signupWizard: WizardDefinition<SignupData> = {
  id: "signup",
  initialStepId: "personal",
  steps: {
    personal: {
      id: "personal",
      next: { type: "static", to: "plan" },
      validate: (data) => ({
        valid: Boolean(data.name && data.email),
        errors: !data.name ? { name: "Required" } : undefined,
      }),
      meta: { title: "Personal Info" },
    },
    plan: {
      id: "plan",
      previous: { type: "static", to: "personal" },
      next: {
        type: "conditional",
        branches: [
          { when: (d) => d.needsInvoice, to: "invoice" },
          { when: () => true, to: "summary" },
        ],
      },
      meta: { title: "Choose Plan" },
    },
    invoice: {
      id: "invoice",
      enabled: (d) => d.needsInvoice,
      previous: { type: "static", to: "plan" },
      next: { type: "static", to: "summary" },
      meta: { title: "Invoice Details" },
    },
    summary: {
      id: "summary",
      previous: {
        type: "resolver",
        resolve: (data) => (data.needsInvoice ? "invoice" : "plan"),
      },
      validate: (data) => ({
        valid: data.termsAccepted,
        errors: !data.termsAccepted ? { terms: "Must accept" } : undefined,
      }),
      onSubmit: async (data, ctx) => {
        // Submit to backend
      },
      meta: { title: "Review & Confirm" },
    },
  },
};
```

### 3. Or Use Builder Pattern

```typescript
import { createWizard } from "@gooonzick/wizard-core";

const wizard = createWizard<SignupData>("signup")
  .initialStep("personal")
  .step("personal", (step) => {
    step.title("Personal Info").required("name", "email").next("plan");
  })
  .step("plan", (step) => {
    step
      .title("Choose Plan")
      .previous("personal")
      .nextWhen([
        { when: (d) => d.needsInvoice, to: "invoice" },
        { when: () => true, to: "summary" },
      ]);
  })
  .build();
```

### 4. Use with React

```typescript
import { useWizard } from "@gooonzick/wizard-react";

function WizardComponent() {
  const { state, navigation, actions, validation, loading } = useWizard({
    definition: signupWizard,
    initialData: {
      name: "",
      email: "",
      plan: "basic",
      needsInvoice: false,
      termsAccepted: false,
    },
    onComplete: (data) => {
      console.log("Wizard completed!", data);
    },
  });

  return (
    <div>
      <h2>{state.currentStep.meta?.title}</h2>
      <p>Step {state.currentStepId}</p>

      {/* Render step content */}
      {state.currentStepId === "personal" && (
        <div>
          <input
            value={state.data.name}
            onChange={(e) => actions.updateField("name", e.target.value)}
            placeholder="Name"
          />
          <input
            value={state.data.email}
            onChange={(e) => actions.updateField("email", e.target.value)}
            placeholder="Email"
          />
        </div>
      )}

      {/* Validation errors */}
      {validation.validationErrors && (
        <div className="errors">
          {Object.values(validation.validationErrors).map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {/* Navigation */}
      <button
        onClick={() => navigation.goPrevious()}
        disabled={!navigation.canGoPrevious || loading.isNavigating}
      >
        Previous
      </button>

      <button
        onClick={() => navigation.goNext()}
        disabled={!navigation.canGoNext || loading.isNavigating}
      >
        {navigation.isLastStep ? "Complete" : "Next"}
      </button>
    </div>
  );
}
```

### 5. Or Use Runtime Machine Directly

```typescript
import { WizardMachine, createWizardContext } from "@gooonzick/wizard-core";

const context = createWizardContext({
  logger: console,
  api: myApiClient,
});

const machine = new WizardMachine(signupWizard, context, initialData, {
  onStateChange: (state) => console.log("State:", state),
  onComplete: (data) => console.log("Complete:", data),
});

// Navigate
await machine.goNext();
await machine.goPrevious();

// Update data
machine.updateData((data) => ({ ...data, name: "John" }));

// Validate current step
const result = await machine.validate();

// Submit current step
await machine.submit();
```

## 📚 Core Concepts

### Step Transitions

Three types of transitions between steps:

#### Static Transition

```typescript
next: { type: 'static', to: 'nextStep' }
```

#### Conditional Transition

```typescript
next: {
  type: 'conditional',
  branches: [
    { when: (data) => data.isPremium, to: 'premiumFlow' },
    { when: (data) => data.isBasic, to: 'basicFlow' },
    { when: () => true, to: 'defaultFlow' }, // fallback
  ],
}
```

#### Resolver Transition

```typescript
next: {
  type: 'resolver',
  resolve: async (data, ctx) => {
    const result = await ctx.api.checkUserType(data.email);
    return result.isPremium ? 'premiumStep' : 'basicStep';
  },
}
```

### Guards

Control step availability:

```typescript
{
  id: 'optionalStep',
  enabled: (data) => data.hasFeatureFlag,
  // or static
  enabled: false,
}
```

### Validators

```typescript
validate: (data, ctx) => {
  const errors: Record<string, string> = {};

  if (!data.email?.includes("@")) {
    errors.email = "Invalid email";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
};
```

### Lifecycle Hooks

```typescript
{
  onEnter: async (data, ctx) => {
    // Called when entering step
    await ctx.api.trackStep('entered', data);
  },

  onLeave: async (data, ctx) => {
    // Called when leaving step
    await ctx.api.saveProgress(data);
  },

  onSubmit: async (data, ctx) => {
    // Called on step submission
    await ctx.api.submitStepData(data);
  },
}
```

## 🛠️ Advanced Features

### Custom Validators

```typescript
import {
  combineValidators,
  requiredFields,
  createValidator,
} from "@gooonzick/wizard-core";

const emailValidator = createValidator(
  (data) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),
  "Invalid email format",
  "email",
);

const step = {
  validate: combineValidators(requiredFields("name", "email"), emailValidator),
};
```

### Standard Schema Validators

WizardForm understands any validator that implements the [Standard Schema](https://standardschema.dev/) contract. Wrap your favorite schema library (Valibot, ArkType, Zod adapters, etc.) with `createStandardSchemaValidator` and WizardMachine will handle the rest.

```typescript
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";
import { mySchema } from "./schema"; // Anything exposing the ~standard interface

const step = {
  validate: createStandardSchemaValidator(mySchema, {
    mapIssueToField: (issue) => issue.path?.[0]?.toString(),
  }),
};
```

### Guard Combinators

```typescript
import { andGuards, orGuards, notGuard } from "@gooonzick/wizard-core";

const isPremium = (data) => data.plan === "premium";
const hasInvoice = (data) => data.needsInvoice;
const isEligible = (data) => data.age >= 18;

// Combine guards
enabled: andGuards(isPremium, orGuards(hasInvoice, isEligible));
// Equivalent to: isPremium && (hasInvoice || isEligible)
```

### Context Extensions

```typescript
interface MyContext extends WizardContext {
  api: ApiClient;
  router: Router;
  analytics: Analytics;
}

const context: MyContext = {
  api: new ApiClient(),
  router: appRouter,
  analytics: new Analytics(),
};

// Use in validators/hooks
validate: async (data, ctx: MyContext) => {
  const isValid = await ctx.api.validateEmail(data.email);
  ctx.analytics.track("email_validated", { valid: isValid });
  return { valid: isValid };
};
```

### Linear Wizard Helper

For simple linear flows:

```typescript
import { createLinearWizard } from "@gooonzick/wizard-core";

const wizard = createLinearWizard({
  id: "onboarding",
  steps: [
    {
      id: "welcome",
      title: "Welcome",
      validate: (data) => ({ valid: true }),
    },
    {
      id: "profile",
      title: "Create Profile",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: !data.name ? { name: "Required" } : undefined,
      }),
    },
    {
      id: "done",
      title: "Complete",
      onSubmit: async (data) => {
        await saveProfile(data);
      },
    },
  ],
  onComplete: async (data) => {
    window.location.href = "/dashboard";
  },
});
```

## 📂 Project Structure

```
wizard-vite/
├── packages/
│   ├── core/                    # Framework-agnostic core
│   │   └── src/
│   │       ├── types/           # TypeScript type definitions
│   │       │   ├── base.ts      # Base utility types
│   │       │   ├── transitions.ts # Transition types
│   │       │   ├── step.ts      # Step definition types
│   │       │   ├── definition.ts # Wizard definition types
│   │       │   └── context.ts   # Context types and utilities
│   │       ├── machine/         # Runtime engine
│   │       │   ├── wizard-machine.ts # Core state machine
│   │       │   ├── validators.ts     # Validator utilities
│   │       │   └── transitions.ts    # Transition resolvers
│   │       ├── builders/        # Fluent API builders
│   │       │   ├── create-step.ts    # Step builder
│   │       │   └── create-wizard.ts  # Wizard builder
│   │       └── index.ts         # Public API exports
│   ├── react/                   # React integration
│   │   └── src/
│   │       ├── use-wizard.tsx   # Main React hook
│   │       ├── use-wizard-granular.tsx # Granular hooks
│   │       └── wizard-provider.tsx # Context provider
│   └── vue/                     # Vue 3 integration
│       └── src/
│           ├── use-wizard.ts    # Main Vue composable
│           ├── use-wizard-granular.ts # Granular composables
│           └── wizard-provider.ts # Provide/inject provider
├── examples/
│   └── react-examples/          # React example application
└── docs/                        # Documentation
```

## 🎯 Design Principles

1. **Declarative Over Imperative**: Define what, not how
2. **Type Safety First**: Full TypeScript support
3. **Separation of Concerns**: UI logic separate from wizard logic
4. **Extensible by Design**: Easy to add custom behaviors
5. **Framework Agnostic Core**: Works with any UI framework
6. **State Machine Architecture**: Predictable state transitions

## 🔄 Migration Guide

### From Imperative Code

Before:

```typescript
// Imperative approach
if (currentStep === 1) {
  if (validateStep1()) {
    if (data.needsInvoice) {
      currentStep = 2; // invoice
    } else {
      currentStep = 3; // payment
    }
  }
}
```

After:

```typescript
// Declarative approach
{
  next: {
    type: 'conditional',
    branches: [
      { when: d => d.needsInvoice, to: 'invoice' },
      { when: () => true, to: 'payment' },
    ],
  },
  validate: validateStep1,
}
```

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines.

## 🔗 Links

- [Documentation](./docs)
- [Examples](./examples)
- [API Reference](./docs/api-reference.md)
