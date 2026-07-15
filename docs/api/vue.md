
# Vue Package (`@gooonzick/wizard-vue`)

## useWizard Composable

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
   * NOT reactive). Define them outside setup or hoist them.
   */
  plugins?: WizardPlugin<T>[];
}
```

### UseWizardReturn&lt;T&gt;

The composable returns an organized object with five slices. All state values are `ComputedRef`.

```ts
interface UseWizardReturn<T> {
  state: UseWizardState<T>;
  validation: UseWizardValidation;
  navigation: UseWizardNavigation;
  loading: UseWizardLoading;
  actions: UseWizardActions<T>;
}

interface UseWizardState<T> {
  currentStepId: ComputedRef<StepId>;
  currentStep: ComputedRef<WizardStepDefinition<T>>;
  data: ComputedRef<T>;
  isCompleted: ComputedRef<boolean>;
  stepStatuses: ComputedRef<Record<StepId, StepStatus>>;
  progress: ComputedRef<WizardProgress>;
}

interface UseWizardValidation {
  isValid: ComputedRef<boolean>;
  validationErrors: ComputedRef<Record<string, string> | undefined>;
}

interface UseWizardNavigation {
  // State (all ComputedRef)
  canGoNext: ComputedRef<boolean>;
  canGoPrevious: ComputedRef<boolean>;
  canGoBack: ComputedRef<boolean>; // true when history stack has > 1 entry
  isFirstStep: ComputedRef<boolean>;
  isLastStep: ComputedRef<boolean>;
  visitedSteps: ComputedRef<StepId[]>;
  availableSteps: ComputedRef<StepId[]>;
  stepHistory: ComputedRef<StepId[]>;
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
  isValidating: ComputedRef<boolean>;
  isSubmitting: ComputedRef<boolean>;
  isNavigating: ComputedRef<boolean>;
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

## useWizardField Composable

Writable computed ref for `v-model` binding. Two overloads:

```ts
// Inside WizardProvider — field only (uses inject)
function useWizardField<T extends WizardData, K extends keyof T>(
  field: K,
): WritableComputedRef<T[K]>;

// With an explicit useWizard() return value
function useWizardField<T extends WizardData, K extends keyof T>(
  wizard: UseWizardReturn<T>,
  field: K,
): WritableComputedRef<T[K]>;
```

Reads from wizard state and writes through `actions.updateField()` — no second reactive store.

**With `useWizard()`:**

```vue
<script setup lang="ts">
const wizard = useWizard({ definition, initialData });
const name = useWizardField(wizard, "name");
</script>

<template>
  <input v-model="name" />
</template>
```

**Inside `WizardProvider`:**

```vue
<script setup lang="ts">
// No wizard argument — resolves via provide/inject
const email = useWizardField<{ email: string }, "email">("email");
</script>

<template>
  <input v-model="email" />
</template>
```

## Granular Composables

For fine-grained subscriptions, use `WizardProvider` with these composables:

```ts
const { data, currentStepId, currentStep, isCompleted } = useWizardData<T>();
const { canGoNext, canGoPrevious, canGoBack, goNext, goPrevious, goTo, ... } = useWizardNavigation();
const { isValid, validationErrors } = useWizardValidation();
const { isValidating, isSubmitting, isNavigating } = useWizardLoading();
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

Provider component for sharing wizard state via provide/inject. Props mirror
`UseWizardOptions` (`definition`, `initialData`, callbacks, `plugins`).

```vue
<template>
  <WizardProvider :definition="definition" :initial-data="initialData">
    <MyWizardForm />
  </WizardProvider>
</template>
```

### `createTypedWizardProvider`

Factory that returns a pre-typed `Provider` plus granular composables for a
specific data type (avoids casting at call sites):

```ts
const {
  Provider,
  useData,
  useActions,
  useNavigation,
  useValidation,
  useLoading,
} = createTypedWizardProvider<MyFormData>();
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
} from "@gooonzick/wizard-vue";
```

## Related Documentation

- See the [Core API](./core.md) for framework-agnostic wizard engine
- See the [React API](./react.md) for the React integration
