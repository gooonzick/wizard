# @gooonzick/wizard-react

React integration for the WizardForm state machine. Provides a convenient `useWizard()` hook that connects your wizard definitions to React state.

## Features

- **React Hook** - Simple `useWizard()` hook for React components
- **Organized API** - State grouped into logical slices (state, validation, navigation, loading, actions)
- **Granular Hooks** - Fine-grained subscriptions with `useWizardData()`, `useWizardNavigation()`, etc.
- **Optional Provider** - `WizardProvider` for performance optimization in complex UIs
- **Full Type Safety** - TypeScript generics for your data types
- **State Management** - Built-in React state handling with zero configuration
- **Loading States** - Track validation, submission, and navigation
- **Backwards Compatible** - 100% compatible with existing code

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react
```

## Quick Start

```tsx
import { useWizard } from "@gooonzick/wizard-react";
import { createLinearWizard } from "@gooonzick/wizard-core";

type SignupData = {
  name: string;
  email: string;
};

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
    },
  ],
});

export function SignupForm() {
  const { state, navigation, actions, validation, loading } = useWizard({
    definition: wizard,
    initialData: { name: "", email: "" },
  });

  return (
    <div>
      <h2>{state.currentStep.meta?.title}</h2>

      {state.currentStepId === "name" && (
        <input
          value={state.data.name}
          onChange={(e) => actions.updateField("name", e.target.value)}
          placeholder="Name"
        />
      )}

      {state.currentStepId === "email" && (
        <input
          value={state.data.email}
          onChange={(e) => actions.updateField("email", e.target.value)}
          placeholder="Email"
        />
      )}

      {validation.validationErrors && (
        <ul className="errors">
          {Object.entries(validation.validationErrors).map(([field, error]) => (
            <li key={field}>{error}</li>
          ))}
        </ul>
      )}

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

## Core Concepts

### useWizard Hook

The `useWizard()` hook connects a wizard definition to React state and returns an organized object with state grouped into logical slices:

```tsx
const { state, validation, navigation, loading, actions } = useWizard({
  definition: wizardDefinition,
  initialData: myInitialData,
  context: myContext,
  onComplete: (data) => {
    // Handle completion
  },
});
```

### Organized State Structure

The hook returns state grouped into five logical slices for clarity:

```tsx
// State slice - current step and data
state.currentStepId;
state.currentStep;
state.data;
state.isCompleted;

// Validation slice
validation.isValid;
validation.validationErrors;

// Navigation slice (state + methods)
navigation.canGoNext;
navigation.canGoPrevious;
navigation.isFirstStep;
navigation.isLastStep;
navigation.visitedSteps;
navigation.availableSteps;
navigation.stepHistory;
navigation.goNext();
navigation.goPrevious();
navigation.goBack(n);
navigation.goToStep(stepId);

// Loading slice
loading.isValidating;
loading.isSubmitting;
loading.isNavigating;

// Actions slice
actions.updateField("name", "John");
actions.updateData((d) => ({ ...d, name: "John" }));
actions.setData(newData);
actions.validate();
actions.canSubmit();
actions.submit();
actions.reset();
```

## Hook API

### useWizard Options

```typescript
interface UseWizardOptions<T> {
  definition: WizardDefinition<T>;
  initialData: T;
  context?: WizardContext;
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: string, data: T) => void;
  onStepLeave?: (stepId: string, data: T) => void;
  onComplete?: (data: T) => void;
  onError?: (error: Error) => void;
}
```

### useWizard Return Value

```typescript
interface UseWizardReturn<T> {
  state: UseWizardState<T>;
  validation: UseWizardValidation;
  navigation: UseWizardNavigation;
  loading: UseWizardLoading;
  actions: UseWizardActions<T>;
}

interface UseWizardState<T> {
  currentStepId: string;
  currentStep: WizardStepDefinition<T>;
  data: T;
  isCompleted: boolean;
}

interface UseWizardValidation {
  isValid: boolean;
  validationErrors?: Record<string, string>;
}

interface UseWizardNavigation {
  canGoNext: boolean;
  canGoPrevious: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  visitedSteps: string[];
  availableSteps: string[];
  stepHistory: string[];
  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  goBack(steps?: number): Promise<void>;
  goToStep(stepId: string): Promise<void>;
}

interface UseWizardLoading {
  isValidating: boolean;
  isSubmitting: boolean;
  isNavigating: boolean;
}

interface UseWizardActions<T> {
  updateData(updater: (data: T) => T): void;
  setData(data: T): void;
  updateField<K extends keyof T>(field: K, value: T[K]): void;
  validate(): Promise<void>;
  canSubmit(): Promise<boolean>;
  submit(): Promise<void>;
  reset(data?: T): void;
}
```

## Granular Hooks (Optional Provider)

For performance-critical applications, use `WizardProvider` with granular hooks to subscribe only to relevant state changes:

```tsx
import {
  WizardProvider,
  useWizardData,
  useWizardNavigation,
  useWizardActions,
} from "@gooonzick/wizard-react";

function App() {
  return (
    <WizardProvider definition={wizard} initialData={initialData}>
      <MyWizardForm />
    </WizardProvider>
  );
}

function MyWizardForm() {
  // Only re-renders when data changes
  const { data, currentStepId } = useWizardData();

  // Only re-renders when navigation state changes
  const { canGoNext, goNext } = useWizardNavigation();

  // Always stable - doesn't cause re-renders
  const { updateField } = useWizardActions();

  return (
    <div>
      <input
        value={data.name}
        onChange={(e) => updateField("name", e.target.value)}
      />
      <button onClick={() => goNext()} disabled={!canGoNext}>
        Next
      </button>
    </div>
  );
}
```

### Available Granular Hooks

- **`useWizardData<T>()`** - Current step ID, step definition, data, completion status
- **`useWizardNavigation()`** - Navigation state and methods (canGoNext, goNext, etc.)
- **`useWizardValidation()`** - Validation status and field errors
- **`useWizardLoading()`** - Loading flags (isValidating, isSubmitting, isNavigating)
- **`useWizardActions<T>()`** - All wizard action methods (updateField, submit, reset, etc.)

### When to Use Granular Hooks

Use granular hooks when:

- Your wizard has many fields and complex components
- You want to prevent unnecessary re-renders
- You're optimizing a large or performance-critical form
- You want fine-grained control over which state changes trigger re-renders

**Note:** Granular hooks require `WizardProvider`. For simple wizards, `useWizard()` alone is sufficient.

## Common Patterns

### Conditional Step Rendering

```tsx
function MyWizard() {
  const { state, navigation, actions, loading } = useWizard({
    definition,
    initialData,
  });

  return (
    <>
      {state.currentStepId === "personal" && (
        <PersonalStep data={state.data} onUpdate={actions.updateField} />
      )}

      {state.currentStepId === "contact" && (
        <ContactStep data={state.data} onUpdate={actions.updateField} />
      )}

      {state.currentStepId === "review" && <ReviewStep data={state.data} />}

      <button
        onClick={() => navigation.goPrevious()}
        disabled={!navigation.canGoPrevious || loading.isNavigating}
      >
        Back
      </button>
      <button
        onClick={() => navigation.goNext()}
        disabled={!navigation.canGoNext || loading.isNavigating}
      >
        {navigation.isLastStep ? "Submit" : "Next"}
      </button>
    </>
  );
}
```

### With React Hook Form

```tsx
import { useForm } from "react-hook-form";
import { useWizard } from "@gooonzick/wizard-react";

function FormWizard() {
  const { register, watch, handleSubmit } = useForm({
    defaultValues: initialData,
  });

  const { state, navigation, actions, validation } = useWizard({
    definition,
    initialData,
  });
  const formData = watch();

  const handleNext = async () => {
    await actions.validate();
    if (validation.isValid) {
      actions.setData(formData);
      await navigation.goNext();
    }
  };

  return (
    <form onSubmit={handleSubmit(handleNext)}>
      {state.currentStepId === "personal" && (
        <>
          <input {...register("name")} />
          <input {...register("email")} />
        </>
      )}

      <button type="submit">Next</button>
    </form>
  );
}
```

### With Context (API Client)

```tsx
interface AppContext extends WizardContext {
  api: ApiClient;
}

const appContext: AppContext = {
  api: new ApiClient(),
};

function Wizard() {
  const { state, navigation, actions } = useWizard({
    definition,
    initialData,
    context: appContext,
  });

  // Definition can now use appContext in validators and hooks
}
```

### Persisting Progress

```tsx
function PersistentWizard() {
  const [savedData, setSavedData] = useState(() => {
    const saved = localStorage.getItem("wizard-data");
    return saved ? JSON.parse(saved) : initialData;
  });

  const wizard = useWizard({
    definition,
    initialData: savedData,
    onStateChange: (state) => {
      localStorage.setItem("wizard-data", JSON.stringify(state.data));
    },
  });

  return (
    <MyWizardForm
      state={wizard.state}
      actions={wizard.actions}
      navigation={wizard.navigation}
    />
  );
}
```

## Best Practices

### 1. Define Wizard Outside Component

```tsx
// ✅ Good - defined once
const wizard = createWizard(/* ... */).build();

function MyComponent() {
  const { state, actions, navigation } = useWizard({
    definition: wizard,
    initialData,
  });
}

// ❌ Bad - recreated every render
function MyComponent() {
  const wizard = createWizard(/* ... */).build();
  const { state, actions, navigation } = useWizard({
    definition: wizard,
    initialData,
  });
}
```

### 2. Use Separate Sub-components

```tsx
// ✅ Good - concerns separated
function WizardContainer() {
  const wizard = useWizard({ definition, initialData });
  return (
    <>
      <StepRenderer state={wizard.state} actions={wizard.actions} />
      <Navigation navigation={wizard.navigation} loading={wizard.loading} />
    </>
  );
}

// ❌ Bad - everything in one component
function WizardContainer() {
  const wizard = useWizard({ definition, initialData });
  return <div>{/* all UI here */}</div>;
}
```

### 3. Await Async Operations

```tsx
// ✅ Good - properly awaiting
const handleNext = async () => {
  await actions.validate();
  if (validation.isValid) {
    await navigation.goNext();
  }
};

// ❌ Bad - not awaiting
const handleNext = () => {
  actions.validate();
  navigation.goNext();
};
```

### 4. Handle Loading States

```tsx
// ✅ Good - disable while loading
<button
  onClick={() => navigation.goNext()}
  disabled={loading.isNavigating || !navigation.canGoNext}
>
  {loading.isNavigating ? "Loading..." : "Next"}
</button>

// ❌ Bad - no feedback to user
<button onClick={() => navigation.goNext()}>Next</button>
```

### 5. Use TypeScript

```tsx
// ✅ Good - full type safety
type MyData = { name: string; email: string };
const { state, actions, navigation } = useWizard<MyData>({
  definition,
  initialData: { name: "", email: "" },
});

// ❌ Bad - no type safety
const { state, actions, navigation } = useWizard({ definition, initialData });
```

## Documentation

For more details, see:

- [React Integration Guide](../../docs/react-integration.md) - Deep dive into React-specific features
- [Getting Started](../../docs/getting-started.md) - Quick introduction
- [Core Concepts](../../docs/core-concepts.md) - Understand the fundamentals
- [API Reference](../../docs/api-reference.md) - Complete API documentation

## Peer Dependencies

- React 19.0+
- React-DOM 19.0+

## License

MIT
