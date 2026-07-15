
# React Integration Guide

This guide covers how to use the `useWizard` hook to integrate wizards into your React application.

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-react
```

## Basic Usage

The `useWizard()` hook connects a wizard definition to React state and provides everything you need to build a wizard UI.

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
      id: "personal",
      title: "Personal Info",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: data.name ? undefined : { name: "Required" },
      }),
    },
    {
      id: "contact",
      title: "Contact Info",
      validate: (data) => ({
        valid: Boolean(data.email),
        errors: data.email ? undefined : { email: "Required" },
      }),
    },
  ],
  onComplete: (data) => {
    console.log("Completed!", data);
  },
});

export function SignupForm() {
  const { state, navigation, actions, validation, loading } = useWizard({
    definition: wizardDef,
    initialData: { name: "", email: "" },
    onComplete: (data) => {
      console.log("Form completed:", data);
    },
  });

  return (
    <div>
      <h2>{state.currentStep.meta?.title}</h2>

      {state.currentStepId === "personal" && (
        <input
          value={state.data.name}
          onChange={(e) => actions.updateField("name", e.target.value)}
          placeholder="Name"
        />
      )}

      {state.currentStepId === "contact" && (
        <input
          value={state.data.email}
          onChange={(e) => actions.updateField("email", e.target.value)}
          placeholder="Email"
        />
      )}

      {validation.validationErrors && (
        <div className="errors">
          {Object.entries(validation.validationErrors).map(([field, error]) => (
            <p key={field}>{error}</p>
          ))}
        </div>
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

## useWizard Hook API

### Options

```typescript
interface UseWizardOptions<T> {
  definition: WizardDefinition<T>;
  initialData: T;
  context?: WizardContext;
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: string, data: T) => void;
  onStepLeave?: (stepId: string, data: T) => void;
  onComplete?: (data: T) => void;
  onCancel?: (data: T) => void | Promise<void>;
  onReset?: () => void;
  onError?: (error: Error) => void;
  onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
  /** Reference-stable — read once at machine creation. */
  plugins?: WizardPlugin<T>[];
}
```

### Return Value

The hook returns an organized object with state grouped into five logical slices:

```typescript
const { state, validation, navigation, loading, actions } = useWizard({ ... });
```

#### State Slice

```typescript
state.currentStepId; // Current step ID
state.currentStep; // Current step definition
state.data; // Current wizard data
state.isCompleted; // Has wizard completed?
state.stepStatuses; // Record<StepId, StepStatus> — status of every step
state.progress; // WizardProgress — computed totals, index, percentage
```

#### Validation Slice

```typescript
validation.isValid; // Is current step valid?
validation.validationErrors; // Field-level errors
```

#### Navigation Slice

```typescript
// State
navigation.canGoNext; // Can move to next step?
navigation.canGoPrevious; // Can move to previous step?
navigation.canGoBack; // Can go back via history stack?
navigation.isFirstStep; // Is on first step?
navigation.isLastStep; // Is on last step?
navigation.visitedSteps; // Array of visited step IDs
navigation.availableSteps; // Array of currently enabled steps
navigation.stepHistory; // Navigation history stack

// Actions
navigation.goNext(); // Go to next step
navigation.goPrevious(); // Go to previous step (pops from history)
navigation.goBack(steps); // Go back N steps (deprecated, use goPrevious)
navigation.goTo(stepId); // Jump to specific step (validates first)
```

#### Loading Slice

```typescript
loading.isValidating; // Validation in progress?
loading.isSubmitting; // Submission in progress?
loading.isNavigating; // Navigation in progress?
```

#### Actions Slice

```typescript
// Update data
actions.updateData((data) => ({ ...data, name: "John" }));
actions.setData(completeData);
actions.updateField("name", "John");
```

React to data changes by passing `onDataChange` to `useWizard`. It fires after any `updateField` / `updateData` / `setData` that changes a top-level field (after `onStateChange`; not on reset/restore/navigation):

```tsx
const { actions } = useWizard({
  definition,
  initialData,
  onDataChange: (prev, next, changedFields) => {
    if (changedFields.includes("plan")) {
      actions.updateField("price", PRICES[next.plan]);
    }
  },
});
```

```typescript
// Validation
actions.validate(); // Manually validate (result goes to validation slice)
actions.validateAll(); // Dry-run all enabled steps → ValidationSummary
actions.validateAll({ updateStatuses: true }); // Also mark invalid steps as "error"
actions.canSubmit(); // Can current step be submitted?
actions.submit(); // Submit current step

// Reset / Cancel
actions.reset(); // Rewind to initial step + initial data, fires onReset
actions.reset(newData); // Rewind with replacement data
actions.cancel(); // Awaits definition.onCancel + onCancel event, then resets

// Persistence
actions.serialize(); // JSON-safe runtime snapshot
actions.restore(savedState); // Re-apply snapshot (throws WizardRestoreError if incompatible)
```

## Reset & Cancel

Use `actions.reset()` to rewind the wizard to its initial step and original
data — for example after an error, or to let the user start over.

```tsx
<button onClick={() => actions.reset()}>Start over</button>
```

Use `actions.cancel()` to abandon the wizard. It awaits the optional
`definition.onCancel` handler (where you can run server-side cleanup, e.g.
delete a draft) and then resets.

```tsx
const handleCancel = async () => {
  if (!confirm("Discard your progress?")) return;
  await actions.cancel();
};
```

Observe both via the `onReset` and `onCancel` event hooks:

```tsx
useWizard({
  definition,
  initialData,
  onCancel: (data) =>
    analytics.track("wizard_cancelled", { email: data.email }),
  onReset: () => analytics.track("wizard_reset"),
});
```

Declarative server cleanup via the wizard definition:

```ts
createWizard<SignupData>("signup")
  // …steps…
  .onCancel(async (data) => {
    await api.deleteDraft(data.draftId);
  })
  .build();
```

## Common Patterns

### Conditional Rendering

```tsx
export function WizardForm() {
  const { state, actions } = useWizard({ definition, initialData });

  return (
    <div>
      <h2>{state.currentStep.meta?.title}</h2>

      {state.currentStepId === "personal" && (
        <PersonalForm data={state.data} onUpdate={actions.updateField} />
      )}

      {state.currentStepId === "address" && (
        <AddressForm data={state.data} onUpdate={actions.updateField} />
      )}

      {state.currentStepId === "review" && <ReviewForm data={state.data} />}
    </div>
  );
}
```

### Form Library Integration (React Hook Form)

```tsx
import { useForm } from "react-hook-form";
import { useWizard } from "@gooonzick/wizard-react";

export function FormWizard() {
  const { register, handleSubmit, watch } = useForm();
  const { state, navigation, actions, validation } = useWizard({
    definition,
    initialData,
  });

  const formData = watch();

  const handleStepSubmit = async () => {
    // Validate current step
    await actions.validate();
    if (validation.isValid) {
      await navigation.goNext();
    }
  };

  return (
    <form onSubmit={handleSubmit(handleStepSubmit)}>
      {state.currentStepId === "personal" && <input {...register("name")} />}

      <button type="submit">
        {navigation.isLastStep ? "Complete" : "Next"}
      </button>
    </form>
  );
}
```

### Custom Context with API Client

```tsx
interface ApiContext extends WizardContext {
  api: ApiClient;
  onError?: (error: Error) => void;
}

const apiContext: ApiContext = {
  api: new ApiClient({
    baseURL: "https://api.example.com",
  }),
};

export function SignupWizard() {
  const { state, navigation, actions } = useWizard({
    definition: signupDefinition,
    initialData: { email: "", plan: "basic" },
    context: apiContext,
    onError: (error) => {
      console.error("Wizard error:", error);
    },
  });

  // The definition can now use apiContext in validators:
  // validate: async (data, ctx) => {
  //   const available = await (ctx as ApiContext).api.checkEmail(data.email);
  //   return { valid: available };
  // }
}
```

### Persisting Progress

Use `actions.serialize()` to save the full runtime snapshot (current step, history, step statuses, validity) and `actions.restore()` to re-apply it on mount.

```tsx
export function PersistentWizard() {
  const { state, actions, navigation } = useWizard({ definition, initialData });

  // Save the full runtime snapshot on every change.
  useEffect(() => {
    localStorage.setItem("wizard-state", JSON.stringify(actions.serialize()));
  }, [state, actions]);

  // Restore once on mount; clear storage if the saved draft is incompatible.
  useEffect(() => {
    const saved = localStorage.getItem("wizard-state");
    if (!saved) return;
    try {
      actions.restore(JSON.parse(saved));
    } catch {
      localStorage.removeItem("wizard-state");
    }
  }, [actions]);

  return (
    <WizardForm
      state={state}
      actions={actions}
      navigation={navigation}
    />
  );
}
```

See `examples/react-examples` for working demos:

- `src/wizard-example.tsx` — basic flow + `validateAll`
- `src/provider-example.tsx` — `WizardProvider` + granular hooks
- `src/state-persistence-example.tsx` — serialize / restore
- `src/plugins-example.tsx` — logging + custom plugins
- `src/reset-cancel-example.tsx`, `src/history-example.tsx`

### Handling Errors

```tsx
export function SafeWizard() {
  const [error, setError] = useState<string | null>(null);

  const wizard = useWizard({
    definition,
    initialData: {
      /* ... */
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <WizardForm
      state={wizard.state}
      actions={wizard.actions}
      navigation={wizard.navigation}
    />
  );
}
```

### Tracking Progress

The `state.progress` slice exposes a precomputed [`WizardProgress`](./api/core.md#wizardprogress)
snapshot, so you don't need to derive totals or percentages by hand.

```tsx
export function ProgressWizard() {
  const { state } = useWizard({ definition, initialData });
  const { progress } = state;

  return (
    <div>
      <div
        className="progress-bar"
        style={{ width: `${progress.percentage}%` }}
      />
      <p>
        Step {progress.currentStepIndex + 1} of {progress.enabledSteps} ·{" "}
        {progress.completedSteps} completed ({progress.percentage}%)
      </p>

      {state.currentStepId === "review" && (
        <div className="review">
          {progress.enabledStepIds.map((stepId) => (
            <div key={stepId}>
              <h4>
                {stepId} — {state.stepStatuses[stepId]}
              </h4>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Loading and Busy States

```tsx
export function StepActions() {
  const { navigation, loading } = useWizard({ definition, initialData });

  return (
    <div>
      <button
        onClick={() => navigation.goPrevious()}
        disabled={!navigation.canGoPrevious || loading.isNavigating}
      >
        {loading.isNavigating ? "Loading..." : "Previous"}
      </button>

      <button
        onClick={() => navigation.goNext()}
        disabled={!navigation.canGoNext || loading.isValidating}
      >
        {loading.isValidating ? "Validating..." : "Next"}
      </button>

      {loading.isSubmitting && <p>Submitting...</p>}
    </div>
  );
}
```

### Multi-step with Tabs

```tsx
export function TabWizard() {
  const { state, navigation } = useWizard({ definition, initialData });

  return (
    <div>
      <div className="tabs">
        {navigation.availableSteps.map((stepId) => {
          const step = definition.steps[stepId];
          const isActive = stepId === state.currentStepId;
          const isVisited = navigation.visitedSteps.includes(stepId);

          return (
            <button
              key={stepId}
              onClick={() => isVisited && navigation.goTo(stepId)}
              className={`tab ${isActive ? "active" : ""}`}
              disabled={!isVisited}
            >
              {step.meta?.title}
            </button>
          );
        })}
      </div>

      <div className="content">{/* Render current step */}</div>
    </div>
  );
}
```

## Organized Hook Return Value

The `useWizard()` hook returns an organized object with state grouped by concern:

```tsx
const { state, validation, navigation, loading, actions } = useWizard({
  definition,
  initialData,
});

// State slice - current step and data
state.data; // Current form data
state.currentStepId; // Current step
state.currentStep; // Current step definition
state.isCompleted; // Is wizard completed?

// Validation slice
validation.isValid; // Is current step valid?
validation.validationErrors; // Field validation errors

// Navigation slice - state and methods
navigation.canGoNext; // Can move forward?
navigation.canGoPrevious; // Can move backward?
navigation.canGoBack; // Can go back via history stack?
navigation.isFirstStep; // Is on first step?
navigation.isLastStep; // Is on last step?
navigation.visitedSteps; // Visited step IDs
navigation.availableSteps; // Enabled step IDs
navigation.stepHistory; // Navigation history stack
navigation.goNext(); // Navigate to next
navigation.goPrevious(); // Navigate to previous (pops history)
navigation.goBack(n); // Go back n steps (deprecated)
navigation.goTo(id); // Jump to specific step (validates first)

// Loading slice
loading.isValidating; // Validation in progress?
loading.isSubmitting; // Submission in progress?
loading.isNavigating; // Navigation in progress?

// Actions slice
actions.updateField("name", "John"); // Update form field
actions.updateData((d) => ({ ...d, name: "John" })); // Update with function
actions.setData(newData); // Replace all data
actions.validate(); // Trigger validation
actions.canSubmit(); // Check if can submit
actions.submit(); // Submit current step
actions.reset(); // Reset to initial data
```

## Granular Hooks (Optional Provider)

For fine-grained subscriptions that prevent unnecessary re-renders, wrap your component tree with `WizardProvider`:

```tsx
import {
  WizardProvider,
  useWizardData,
  useWizardNavigation,
  useWizardValidation,
  useWizardLoading,
  useWizardActions,
} from "@gooonzick/wizard-react";

function App() {
  return (
    <WizardProvider definition={myWizard} initialData={initialData}>
      <MyWizardForm />
    </WizardProvider>
  );
}

function MyWizardForm() {
  // Only subscribes to data changes
  const { data, currentStepId } = useWizardData();

  // Only subscribes to navigation changes
  const { canGoNext, goNext } = useWizardNavigation();

  // Only subscribes to validation changes
  const { isValid, validationErrors } = useWizardValidation();

  // Actions don't cause re-renders
  const { updateField } = useWizardActions();

  return (
    <div>
      {currentStepId === "personal" && (
        <input
          value={data.name}
          onChange={(e) => updateField("name", e.target.value)}
        />
      )}

      {!isValid && validationErrors && (
        <p className="error">{Object.values(validationErrors).join(", ")}</p>
      )}

      <button onClick={() => goNext()} disabled={!canGoNext}>
        Next
      </button>
    </div>
  );
}
```

### Available Granular Hooks

| Hook                    | Returns                                  | Use Case                  |
| ----------------------- | ---------------------------------------- | ------------------------- |
| `useWizardData<T>()`    | Current step, data, isCompleted          | Form inputs, step content |
| `useWizardNavigation()` | canGoNext, goNext, goBack, etc.          | Navigation buttons        |
| `useWizardValidation()` | isValid, validationErrors                | Error display             |
| `useWizardLoading()`    | isValidating, isSubmitting, isNavigating | Loading indicators        |
| `useWizardActions<T>()` | updateField, validateAll, submit, reset, cancel, serialize, restore | Form handlers             |

### When to Use Granular Hooks

Use the **provider + granular hooks** pattern when:

- Your wizard has many components that only need specific slices of state
- You're experiencing performance issues from unnecessary re-renders
- You want to optimize rendering in large forms

Use the **standalone `useWizard()`** pattern when:

- You have a simple wizard with few components
- Performance is not a concern
- You prefer a simpler API

## Migration Guide

The `useWizard()` hook now returns an organized object with nested slices:

```tsx
// New API structure
const { state, validation, navigation, loading, actions } = useWizard({
  definition,
  initialData,
});

// Access state
const data = state.data;
const currentStepId = state.currentStepId;

// Access navigation
const canGoNext = navigation.canGoNext;
await navigation.goNext();

// Access actions
actions.updateField("name", "John");
```

To adopt granular hooks for performance optimization:

```tsx
// Step 1: Wrap with provider
<WizardProvider definition={...} initialData={...}>
  <MyComponent />
</WizardProvider>

// Step 2: Use granular hooks in nested components
const { data, currentStepId } = useWizardData();
const { canGoNext, goNext } = useWizardNavigation();
const { updateField } = useWizardActions();
```

## Best Practices

### 1. Separate Concerns

Keep the wizard logic separate from your UI component:

```tsx
// ❌ Don't: Logic mixed with UI
function MyWizard() {
  const { actions } = useWizard({ definition, initialData });
  return (
    <input onChange={(e) => actions.updateField("name", e.target.value)} />
  );
}

// ✅ Do: Use sub-components
function MyWizard() {
  const wizard = useWizard({ definition, initialData });
  return <PersonalStep state={wizard.state} actions={wizard.actions} />;
}

function PersonalStep({
  state,
  actions,
}: {
  state: UseWizardState<MyData>;
  actions: UseWizardActions<MyData>;
}) {
  return (
    <input onChange={(e) => actions.updateField("name", e.target.value)} />
  );
}
```

### 2. Handle Async Operations

Always await navigation and validation:

```tsx
// ❌ Don't: Fire and forget
const handleNext = () => {
  navigation.goNext(); // Don't await
};

// ✅ Do: Await navigation
const handleNext = async () => {
  await actions.validate();
  if (validation.isValid) {
    await navigation.goNext();
  }
};
```

### 3. Memoize Definition

Create the definition once, outside the component:

```tsx
// ❌ Don't: Recreate definition on every render
function MyWizard() {
  const definition = createWizard(...).build();
  const wizard = useWizard({ definition, ... });
}

// ✅ Do: Create once
const definition = createWizard(...).build();

function MyWizard() {
  const wizard = useWizard({ definition, ... });
}
```

### 4. Use TypeScript

Leverage the type system:

```tsx
// ✅ Do: Type your data and let TypeScript help
type MyData = {
  name: string;
  email: string;
};

const wizard = useWizard<MyData>({
  definition,
  initialData: { name: "", email: "" },
});

// TypeScript knows wizard.data.name exists
```

### 5. Validate Before Navigation

Check validity before moving to the next step:

```tsx
// ✅ Do: Validate first
const handleNext = async () => {
  await actions.validate();
  if (validation.isValid) {
    await navigation.goNext();
  }
};
```

## Debugging

### Log State Changes

```tsx
useWizard({
  definition,
  initialData,
  onStateChange: (state) => {
    console.log("State changed:", state);
  },
});
```

### Inspect Hook Return Value

```tsx
const wizard = useWizard({ definition, initialData });
console.log(wizard); // See all slices: state, validation, navigation, loading, actions
```

### Use React DevTools

Install React DevTools browser extension to inspect hook state in real-time.

### Enable Debug Mode

```tsx
const wizard = useWizard({
  definition,
  initialData,
  context: { debug: true },
});
```

## Troubleshooting

### Wizard won't move to next step

Check:

- Is validation passing? (`validation.isValid`)
- Are all required fields filled?
- Is there an `onError` handler showing errors?

### Data not updating

Check:

- Are you using `actions.updateField()` correctly?
- Is the field name correct?
- Use `console.log(state.data)` to inspect

### Context not available

Check:

- Did you pass `context` to `useWizard()`?
- Are you casting correctly? `ctx as MyContext`
- Is the context value set?

## Performance Optimization

### Memoize Sub-Components

```tsx
const PersonalStep = React.memo(({ data, onUpdate }: Props) => {
  return <form>{/* ... */}</form>;
});
```

### Use useCallback for Handlers

```tsx
const handleNameChange = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    actions.updateField("name", e.target.value);
  },
  [actions],
);
```

### Avoid Inline Object Creation

```tsx
// ❌ Don't: Creates new object every render
const wizard = useWizard({
  definition,
  initialData: { name: "", email: "" },
});

// ✅ Do: Move outside component
const initialData = { name: "", email: "" };
const wizard = useWizard({
  definition,
  initialData,
});
```
