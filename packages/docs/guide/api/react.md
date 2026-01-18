---
title: React API
description: API reference for the @gooonzick/wizard-react package
---

# React Package (`@gooonzick/wizard-react`)

## useWizard Hook

```ts
function useWizard<T extends Record<string, unknown>>(
  options: UseWizardOptions<T>,
): UseWizardReturn<T>;
```

### UseWizardOptions&lt;T&gt;

```ts
interface UseWizardOptions<T> {
  definition: WizardDefinition<T>;
  initialData: T;
  context?: WizardContext;
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: StepId, data: T) => void;
  onStepLeave?: (stepId: StepId, data: T) => void;
  onComplete?: (data: T) => void;
  onError?: (error: Error) => void;
}
```

### UseWizardReturn&lt;T&gt;

The hook returns an organized object with five slices:

```ts
interface UseWizardReturn<T> {
  state: UseWizardState<T>;
  validation: UseWizardValidation;
  navigation: UseWizardNavigation;
  loading: UseWizardLoading;
  actions: UseWizardActions<T>;
}

interface UseWizardState<T> {
  currentStepId: StepId;
  currentStep: WizardStepDefinition<T>;
  data: T;
  isCompleted: boolean;
}

interface UseWizardValidation {
  isValid: boolean;
  validationErrors?: Record<string, string>;
}

interface UseWizardNavigation {
  // State
  canGoNext: boolean;
  canGoPrevious: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  visitedSteps: StepId[];
  availableSteps: StepId[];
  stepHistory: StepId[];
  // Actions
  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  goBack(steps?: number): Promise<void>;
  goToStep(stepId: StepId): Promise<void>;
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

**Example:**

```ts
import { useWizard } from "@gooonzick/wizard-react";

const { state, navigation, actions, validation, loading } = useWizard({
  definition: myWizard,
  initialData: { name: "", email: "" },
  onComplete: (data) => {
    console.log("Completed:", data);
  },
});

// Use state.currentStep, state.data, navigation.goNext(), actions.updateField(), etc.
```

## Granular Hooks

For fine-grained subscriptions, use `WizardProvider` with these hooks:

```ts
// Only subscribes to data changes
const { data, currentStepId, currentStep, isCompleted } = useWizardData<T>();

// Only subscribes to navigation changes
const { canGoNext, canGoPrevious, goNext, goPrevious, ... } = useWizardNavigation();

// Only subscribes to validation changes
const { isValid, validationErrors } = useWizardValidation();

// Only subscribes to loading changes
const { isValidating, isSubmitting, isNavigating } = useWizardLoading();

// Actions (stable, doesn't cause re-renders)
const { updateField, updateData, setData, validate, submit, reset, canSubmit } = useWizardActions<T>();
```

## WizardProvider

Context provider for sharing wizard state:

```ts
interface WizardProviderProps<T> {
  definition: WizardDefinition<T>;
  initialData: T;
  context?: WizardContext;
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: StepId, data: T) => void;
  onStepLeave?: (stepId: StepId, data: T) => void;
  onComplete?: (data: T) => void;
  onError?: (error: Error) => void;
  children: React.ReactNode;
}
```
