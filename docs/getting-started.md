# Getting Started with WizardForm

This guide will help you get up and running with the WizardForm framework in minutes.

## Installation

### Using npm

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react
```

### Using yarn

```bash
yarn add @gooonzick/wizard-core @gooonzick/wizard-react
```

### Using pnpm

```bash
pnpm add @gooonzick/wizard-core @gooonzick/wizard-react
```

## Core vs Framework Integrations

- **`@gooonzick/wizard-core`**: Framework-agnostic state machine. Use this if you're building a wizard in vanilla TypeScript, Svelte, or any other framework.
- **`@gooonzick/wizard-react`**: React-specific integration with the `useWizard()` hook. Use this for React applications.
- **`@gooonzick/wizard-vue`**: Vue 3 Composition API integration. Use this for Vue applications.

## Your First Wizard (React)

Here's a minimal example of a simple two-step wizard in React:

```tsx
import { useWizard } from "@gooonzick/wizard-react";
import { createLinearWizard } from "@gooonzick/wizard-core";

// 1. Define your data type
type FormData = {
  name: string;
  email: string;
};

// 2. Create a simple linear wizard
const wizard = createLinearWizard<FormData>({
  id: "simple-form",
  steps: [
    {
      id: "personal",
      title: "Personal Info",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: !data.name ? { name: "Name is required" } : undefined,
      }),
    },
    {
      id: "contact",
      title: "Contact Info",
      validate: (data) => ({
        valid: Boolean(data.email),
        errors: !data.email ? { email: "Email is required" } : undefined,
      }),
      onSubmit: async (data) => {
        // Handle submission
        console.log("Form submitted:", data);
      },
    },
  ],
  onComplete: (data) => {
    console.log("Wizard completed!", data);
  },
});

// 3. Use in React component
export function MyForm() {
  const { state, navigation, actions, validation, loading } = useWizard({
    definition: wizard,
    initialData: { name: "", email: "" },
  });

  return (
    <div>
      <h2>{state.currentStep.meta?.title}</h2>

      {state.currentStepId === "personal" && (
        <input
          placeholder="Name"
          value={state.data.name}
          onChange={(e) => actions.updateField("name", e.target.value)}
        />
      )}

      {state.currentStepId === "contact" && (
        <input
          placeholder="Email"
          value={state.data.email}
          onChange={(e) => actions.updateField("email", e.target.value)}
        />
      )}

      {validation.validationErrors && (
        <div className="errors">
          {Object.entries(validation.validationErrors).map(([field, error]) => (
            <p key={field}>{error}</p>
          ))}
        </div>
      )}

      <div className="controls">
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
    </div>
  );
}
```

## Your First Wizard (Core Only)

If you're not using React, use `@gooonzick/wizard-core` directly:

```typescript
import { WizardMachine, createLinearWizard } from "@gooonzick/wizard-core";

type FormData = {
  name: string;
  email: string;
};

const wizard = createLinearWizard<FormData>({
  id: "simple-form",
  steps: [
    {
      id: "personal",
      title: "Personal Info",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: !data.name ? { name: "Name is required" } : undefined,
      }),
    },
    {
      id: "contact",
      title: "Contact Info",
      validate: (data) => ({
        valid: Boolean(data.email),
        errors: !data.email ? { email: "Email is required" } : undefined,
      }),
    },
  ],
  onComplete: async (data) => {
    console.log("Wizard completed!", data);
  },
});

// Create a state machine instance
const machine = new WizardMachine(
  wizard,
  {},
  { name: "", email: "" },
  {
    onStateChange: (state) => {
      console.log("Current step:", state.currentStepId);
      console.log("Data:", state.data);
    },
    onComplete: (data) => {
      console.log("Complete:", data);
    },
  },
);

// Navigate
await machine.goNext();
await machine.validate();
await machine.submit();
```

## Key Concepts (Quick Overview)

- **WizardDefinition**: A declarative description of your entire wizard
- **Steps**: Individual pages/forms in your wizard with validation and transitions
- **Transitions**: How to navigate between steps (static, conditional, or dynamic)
- **Validation**: Field-level rules that must pass before moving forward
- **Context**: A way to pass utilities (API client, logger, etc.) to validators and hooks

Learn more about these in the [Core Concepts](./core-concepts.md) guide.

## Next Steps

1. Read [Core Concepts](./core-concepts.md) to understand the framework better
2. Explore [Defining Wizards](./defining-wizards.md) to learn about different definition patterns
3. Check [React Integration](./react-integration.md) for React-specific features
4. Review [API Reference](./api-reference.md) for detailed type information

## Common Questions

**Q: Do I need React?**
A: No! `@gooonzick/wizard-core` works with any JavaScript/TypeScript codebase. Use `@gooonzick/wizard-react` only if you're building a React app.

**Q: Can I use this with form libraries?**
A: Yes! The wizard is agnostic to your form library. You can use it with React Hook Form, Formik, plain React state, or anything else.

**Q: How do I handle async validation?**
A: Validators return `SyncOrAsync<ValidationResult>`, so they support both sync and async operations.

**Q: What about complex branching logic?**
A: Use conditional transitions or resolver transitions. See [Core Concepts](./core-concepts.md) for details.
