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
  onCancel?: (data: T) => void | Promise<void>;
  onReset?: () => void;
  onError?: (error: Error) => void;
  onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
  /**
   * Plugins registered once at machine creation (reference-stable — read once,
   * NOT reactive). Define them outside render or memoize them.
   */
  plugins?: WizardPlugin<T>[];
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
  stepStatuses: Record<StepId, StepStatus>;
  progress: WizardProgress;
}

interface UseWizardValidation {
  isValid: boolean;
  validationErrors?: Record<string, string>;
}

interface UseWizardNavigation {
  // State
  canGoNext: boolean;
  canGoPrevious: boolean;
  canGoBack: boolean; // true when history stack has > 1 entry
  isFirstStep: boolean;
  isLastStep: boolean;
  visitedSteps: StepId[];
  availableSteps: StepId[];
  stepHistory: StepId[];
  // Actions
  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  /** @deprecated Use goPrevious() instead */
  goBack(steps?: number): Promise<void>;
  goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
  /** @deprecated Use goTo(stepId) instead */
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
  validateAll(options?: { updateStatuses?: boolean }): Promise<ValidationSummary>;
  canSubmit(): Promise<boolean>;
  submit(): Promise<void>;
  reset(data?: T): void;
  cancel(): Promise<void>;
  serialize(): WizardSerializedState<T>;
  restore(state: WizardSerializedState<T>): void;
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
const { canGoNext, canGoPrevious, goNext, goPrevious, goTo, ... } = useWizardNavigation();

// Only subscribes to validation changes
const { isValid, validationErrors } = useWizardValidation();

// Only subscribes to loading changes
const { isValidating, isSubmitting, isNavigating } = useWizardLoading();

// Actions (stable, doesn't cause re-renders)
const {
  updateField,
  updateData,
  setData,
  validate,
  validateAll,
  canSubmit,
  submit,
  reset,
  cancel,
  serialize,
  restore,
} = useWizardActions<T>();
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
  onCancel?: (data: T) => void | Promise<void>;
  onReset?: () => void;
  onError?: (error: Error) => void;
  onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;
  /** Reference-stable — read once at machine creation. */
  plugins?: WizardPlugin<T>[];
  children: React.ReactNode;
}
```

## Exported helper types

Action function aliases are exported for typing callbacks and wrappers:

```ts
import type {
  ValidateFn,
  ValidateAllFn,
  CanSubmitFn,
  CancelFn,
  SerializeFn,
  RestoreFn,
  // …
} from "@gooonzick/wizard-react";
```
