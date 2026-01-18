---
title: Vue Integration
description: How to use the useWizard composable to integrate wizards into your Vue 3 application
---

# Vue Integration Guide

This guide covers how to use the `useWizard` composable to integrate wizards into your Vue 3 application.

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-vue
```

## Basic Usage

The `useWizard()` composable connects a wizard definition to Vue reactive state and provides everything you need to build a wizard UI.

```typescript
<script setup lang="ts">
import { useWizard } from "@gooonzick/wizard-vue";
import { createLinearWizard } from "@gooonzick/wizard-core";

type SignupData = {
  name: string;
  email: string;
};

const wizardDef = createLinearWizard<SignupData>({
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

const { state, navigation, actions, validation, loading } = useWizard({
  definition: wizardDef,
  initialData: { name: "", email: "" },
  onComplete: (data) => {
    console.log("Form completed:", data);
  },
});
</script>

<template>
  <div>
    <h2>{{ state.currentStep.meta?.title }}</h2>

    <input
      v-if="state.currentStepId.value === 'personal'"
      v-model="state.data.value.name"
      placeholder="Name"
    />

    <input
      v-if="state.currentStepId.value === 'contact'"
      v-model="state.data.value.email"
      placeholder="Email"
    />

    <div v-if="validation.validationErrors.value" class="errors">
      <p
        v-for="(error, field) in validation.validationErrors.value"
        :key="field"
      >
        {{ error }}
      </p>
    </div>

    <button
      @click="navigation.goPrevious()"
      :disabled="!navigation.canGoPrevious.value || loading.isNavigating.value"
    >
      Previous
    </button>
    <button
      @click="navigation.goNext()"
      :disabled="!navigation.canGoNext.value || loading.isNavigating.value"
    >
      {{ navigation.isLastStep.value ? "Complete" : "Next" }}
    </button>
  </div>
</template>
```

## useWizard Composable API

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
  onError?: (error: Error) => void;
}
```

### Return Value

The composable returns an organized object with state grouped into five logical slices:

```typescript
const { state, validation, navigation, loading, actions } = useWizard({ ... });
```

#### State Slice

```typescript
state.currentStepId.value; // Current step ID (ComputedRef)
state.currentStep.value; // Current step definition (ComputedRef)
state.data.value; // Current wizard data (ComputedRef)
state.isCompleted.value; // Has wizard completed? (ComputedRef)
```

#### Validation Slice

```typescript
validation.isValid.value; // Is current step valid? (ComputedRef)
validation.validationErrors.value; // Field-level errors (ComputedRef)
```

#### Navigation Slice

```typescript
// State (all ComputedRef)
navigation.canGoNext.value; // Can move to next step?
navigation.canGoPrevious.value; // Can move to previous step?
navigation.isFirstStep.value; // Is on first step?
navigation.isLastStep.value; // Is on last step?
navigation.visitedSteps.value; // Array of visited step IDs
navigation.availableSteps.value; // Array of currently enabled steps
navigation.stepHistory.value; // Ordered history of navigation

// Actions
await navigation.goNext(); // Go to next step
await navigation.goPrevious(); // Go to previous step
await navigation.goBack(n); // Go back n steps
await navigation.goToStep(id); // Jump to specific step
```

#### Loading Slice

```typescript
loading.isValidating.value; // Validation in progress? (ComputedRef)
loading.isSubmitting.value; // Submission in progress? (ComputedRef)
loading.isNavigating.value; // Navigation in progress? (ComputedRef)
```

#### Actions Slice

```typescript
// Update data
actions.updateData((data) => ({ ...data, name: "John" }));
actions.setData(completeData);
actions.updateField("name", "John");

// Validation
await actions.validate(); // Manually validate (result goes to validation slice)
await actions.canSubmit(); // Check if can submit
await actions.submit(); // Submit current step

// Reset
actions.reset(); // Reset to initial data
actions.reset(newData); // Reset with new data
```

## Common Patterns

### Conditional Rendering

```typescript
<script setup lang="ts">
const { state, actions } = useWizard({ definition, initialData });
</script>

<template>
  <div>
    <h2>{{ state.currentStep.meta?.title }}</h2>

    <PersonalForm
      v-if="state.currentStepId.value === 'personal'"
      :data="state.data.value"
      @update="actions.updateField"
    />

    <AddressForm
      v-if="state.currentStepId.value === 'address'"
      :data="state.data.value"
      @update="actions.updateField"
    />

    <ReviewForm v-if="state.currentStepId.value === 'review'" :data="state.data.value" />
  </div>
</template>
```

### Form Library Integration (VeeValidate)

```typescript
<script setup lang="ts">
import { useForm } from "vee-validate";
import { useWizard } from "@gooonzick/wizard-vue";

const { handleSubmit, values: formData } = useForm();

const { state, navigation, actions, validation } = useWizard({
  definition,
  initialData,
});

const handleStepSubmit = async () => {
  // Validate current step
  await actions.validate();
  if (validation.isValid.value) {
    await navigation.goNext();
  }
};
</script>

<template>
  <form @submit="handleSubmit(handleStepSubmit)">
    <input
      v-if="state.currentStepId.value === 'personal'"
      v-model="formData.name"
      name="name"
    />

    <button type="submit">
      {{ navigation.isLastStep.value ? "Complete" : "Next" }}
    </button>
  </form>
</template>
```

### Custom Context with API Client

```typescript
interface ApiContext extends WizardContext {
  api: ApiClient;
  onError?: (error: Error) => void;
}

const apiContext: ApiContext = {
  api: new ApiClient({
    baseURL: "https://api.example.com",
  }),
};
```

```typescript
<script setup lang="ts">
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
</script>
```

### Persisting Progress

```typescript
<script setup lang="ts">
import { ref, watch } from "vue";

const savedData = ref(() => {
  const saved = localStorage.getItem("wizard-data");
  return saved ? JSON.parse(saved) : initialData;
});

const wizard = useWizard({
  definition,
  initialData: savedData.value,
  onStateChange: (state) => {
    // Save after each state change
    localStorage.setItem("wizard-data", JSON.stringify(state.data));
  },
});
</script>

<template>
  <WizardForm
    :state="wizard.state"
    :actions="wizard.actions"
    :navigation="wizard.navigation"
  />
</template>
```

### Handling Errors

```typescript
<script setup lang="ts">
import { ref } from "vue";

const error = ref<string | null>(null);

const wizard = useWizard({
  definition,
  initialData: {
    /* ... */
  },
  onError: (err) => {
    error.value = err.message;
  },
});
</script>

<template>
  <div v-if="error" class="error">
    <p>{{ error }}</p>
    <button @click="error = null">Dismiss</button>
  </div>

  <WizardForm
    v-else
    :state="wizard.state"
    :actions="wizard.actions"
    :navigation="wizard.navigation"
  />
</template>
```

### Tracking Progress

```typescript
<script setup lang="ts">
import { computed } from "vue";

const { state, navigation } = useWizard({ definition, initialData });

const progress = computed(
  () =>
    (navigation.visitedSteps.value.length / navigation.availableSteps.value.length) *
    100,
);
</script>

<template>
  <div>
    <div class="progress-bar" :style="{ width: `${progress}%` }" />
    <p>
      Step {{ navigation.visitedSteps.value.length }} of
      {{ navigation.availableSteps.value.length }}
    </p>

    <div v-if="state.currentStepId.value === 'review'" class="review">
      <div v-for="stepId in navigation.visitedSteps.value" :key="stepId">
        <h4>{{ state.currentStep.value.meta?.title }}</h4>
      </div>
    </div>
  </div>
</template>
```

### Loading and Busy States

```typescript
<script setup lang="ts">
const { navigation, loading } = useWizard({ definition, initialData });
</script>

<template>
  <div>
    <button
      @click="navigation.goPrevious()"
      :disabled="!navigation.canGoPrevious.value || loading.isNavigating.value"
    >
      {{ loading.isNavigating.value ? "Loading..." : "Previous" }}
    </button>

    <button
      @click="navigation.goNext()"
      :disabled="!navigation.canGoNext.value || loading.isValidating.value"
    >
      {{ loading.isValidating.value ? "Validating..." : "Next" }}
    </button>

    <p v-if="loading.isSubmitting.value">Submitting...</p>
  </div>
</template>
```

### Multi-step with Tabs

```typescript
<script setup lang="ts">
const { state, navigation } = useWizard({ definition, initialData });

const isStepVisited = (stepId: string) => {
  return navigation.visitedSteps.value.includes(stepId);
};
</script>

<template>
  <div>
    <div class="tabs">
      <button
        v-for="stepId in navigation.availableSteps.value"
        :key="stepId"
        @click="isStepVisited(stepId) && navigation.goToStep(stepId)"
        :class="['tab', { active: stepId === state.currentStepId.value }]"
        :disabled="!isStepVisited(stepId)"
      >
        {{ definition.steps[stepId].meta?.title }}
      </button>
    </div>

    <div class="content">
      <!-- Render current step -->
    </div>
  </div>
</template>
```

## Organized Composable Return Value

The `useWizard()` composable returns an organized object with state grouped by concern:

```typescript
<script setup lang="ts">
const { state, validation, navigation, loading, actions } = useWizard({
  definition,
  initialData,
});

// State slice - current step and data
const data = state.data.value; // Current form data
const currentStepId = state.currentStepId.value; // Current step
const currentStep = state.currentStep.value; // Current step definition
const isCompleted = state.isCompleted.value; // Is wizard completed?

// Validation slice
const isValid = validation.isValid.value; // Is current step valid?
const validationErrors = validation.validationErrors.value; // Field validation errors

// Navigation slice - state and methods
const canGoNext = navigation.canGoNext.value; // Can move forward?
const canGoPrevious = navigation.canGoPrevious.value; // Can move backward?
const isFirstStep = navigation.isFirstStep.value; // Is on first step?
const isLastStep = navigation.isLastStep.value; // Is on last step?
const visitedSteps = navigation.visitedSteps.value; // Visited step IDs
const availableSteps = navigation.availableSteps.value; // Enabled step IDs
const stepHistory = navigation.stepHistory.value; // Navigation history

// Navigation actions
await navigation.goNext(); // Navigate to next
await navigation.goPrevious(); // Navigate to previous
await navigation.goBack(n); // Go back n steps
await navigation.goToStep(id); // Jump to specific step

// Loading slice
const isValidating = loading.isValidating.value; // Validation in progress?
const isSubmitting = loading.isSubmitting.value; // Submission in progress?
const isNavigating = loading.isNavigating.value; // Navigation in progress?

// Actions slice
actions.updateField("name", "John"); // Update form field
actions.updateData((d) => ({ ...d, name: "John" })); // Update with function
actions.setData(newData); // Replace all data
await actions.validate(); // Trigger validation
await actions.canSubmit(); // Check if can submit
await actions.submit(); // Submit current step
actions.reset(); // Reset to initial data
</script>
```

## Granular Composables (Optional Provider)

For fine-grained subscriptions that prevent unnecessary re-renders, wrap your component tree with `WizardProvider`:

```typescript
<script setup lang="ts">
import {
  WizardProvider,
  useWizardData,
  useWizardNavigation,
  useWizardValidation,
  useWizardLoading,
  useWizardActions,
} from "@gooonzick/wizard-vue";
</script>

<template>
  <WizardProvider :definition="myWizard" :initial-data="initialData">
    <MyWizardForm />
  </WizardProvider>
</template>
```

```typescript
<script setup lang="ts">
// Only subscribes to data changes
const { data, currentStepId } = useWizardData();

// Only subscribes to navigation changes
const { canGoNext, goNext } = useWizardNavigation();

// Only subscribes to validation changes
const { isValid, validationErrors } = useWizardValidation();

// Actions don't cause re-renders
const { updateField } = useWizardActions();
</script>

<template>
  <div>
    <input
      v-if="currentStepId.value === 'personal'"
      :value="data.value.name"
      @input="updateField('name', ($event.target as HTMLInputElement).value)"
    />

    <div v-if="!isValid.value && validationErrors.value" class="error">
      <p>{{ Object.values(validationErrors.value).join(", ") }}</p>
    </div>

    <button @click="goNext" :disabled="!canGoNext.value">Next</button>
  </div>
</template>
```

### Available Granular Composables

| Composable                     | Returns                                  | Use Case                  |
| ------------------------------ | ---------------------------------------- | ------------------------- |
| `useWizardData<T>()`           | Current step, data, isCompleted          | Form inputs, step content |
| `useWizardNavigation()`        | canGoNext, goNext, goBack, etc.          | Navigation buttons        |
| `useWizardValidation()`        | isValid, validationErrors                | Error display             |
| `useWizardLoading()`           | isValidating, isSubmitting, isNavigating | Loading indicators        |
| `useWizardActions<T>()`        | updateField, submit, reset               | Form handlers             |

### When to Use Granular Composables

Use the **provider + granular composables** pattern when:

- Your wizard has many components that only need specific slices of state
- You're experiencing performance issues from unnecessary re-renders
- You want to optimize rendering in large forms

Use the **standalone `useWizard()`** pattern when:

- You have a simple wizard with few components
- Performance is not a concern
- You prefer a simpler API

## Migration Guide

The `useWizard()` composable now returns an organized object with nested slices and `ComputedRef` values:

```typescript
<script setup lang="ts">
// New API structure
const { state, validation, navigation, loading, actions } = useWizard({
  definition,
  initialData,
});

// Access state (note the .value for ComputedRef)
const data = state.data.value;
const currentStepId = state.currentStepId.value;

// Access navigation
const canGoNext = navigation.canGoNext.value;
await navigation.goNext();

// Access actions
actions.updateField("name", "John");
</script>
```

To adopt granular composables for performance optimization:

```typescript
<!-- Step 1: Wrap with provider -->
<WizardProvider :definition="definition" :initial-data="initialData">
  <MyComponent />
</WizardProvider>

<!-- Step 2: Use granular composables in nested components -->
<script setup lang="ts">
const { data, currentStepId } = useWizardData();
const { canGoNext, goNext } = useWizardNavigation();
const { updateField } = useWizardActions();
</script>
```

## Best Practices

### 1. Separate Concerns

Keep the wizard logic separate from your UI component:

```typescript
<!-- ❌ Don't: Logic mixed with UI -->
<script setup lang="ts">
const { actions } = useWizard({ definition, initialData });
</script>

<template>
  <input @input="actions.updateField('name', $event.target.value)" />
</template>
```

```typescript
<!-- ✅ Do: Use sub-components -->
<script setup lang="ts">
const wizard = useWizard({ definition, initialData });
</script>

<template>
  <PersonalStep :state="wizard.state" :actions="wizard.actions" />
</template>
```

```typescript
<script setup lang="ts">
type Props = {
  state: UseWizardState<MyData>;
  actions: UseWizardActions<MyData>;
};

const props = defineProps<Props>();
</script>

<template>
  <input
    :value="props.state.data.value.name"
    @input="props.actions.updateField('name', $event.target.value)"
  />
</template>
```

### 2. Handle Async Operations

Always await navigation and validation:

```typescript
<script setup lang="ts">
// ❌ Don't: Fire and forget
const handleNext = () => {
  navigation.goNext(); // Don't await
};

// ✅ Do: Await navigation
const handleNext = async () => {
  await actions.validate();
  if (validation.isValid.value) {
    await navigation.goNext();
  }
};
</script>
```

### 3. Memoize Definition

Create the definition once, outside the component:

```typescript
<!-- ❌ Don't: Recreate definition on every render -->
<script setup lang="ts">
const definition = createWizard(...).build();
const wizard = useWizard({ definition, ... });
</script>

<!-- ✅ Do: Create once in module scope -->
<script setup lang="ts">
const wizard = useWizard({ definition, ... });
</script>

<script lang="ts">
// Module scope - created once
const definition = createWizard(...).build();
</script>
```

### 4. Use TypeScript

Leverage the type system:

```typescript
<script setup lang="ts">
// ✅ Do: Type your data and let TypeScript help
type MyData = {
  name: string;
  email: string;
};

const wizard = useWizard<MyData>({
  definition,
  initialData: { name: "", email: "" },
});

// TypeScript knows wizard.data.value.name exists
</script>
```

### 5. Validate Before Navigation

Check validity before moving to the next step:

```typescript
<script setup lang="ts">
// ✅ Do: Validate first
const handleNext = async () => {
  await actions.validate();
  if (validation.isValid.value) {
    await navigation.goNext();
  }
};
</script>
```

## Debugging

### Log State Changes

```typescript
<script setup lang="ts">
const wizard = useWizard({
  definition,
  initialData,
  onStateChange: (state) => {
    console.log("State changed:", state);
  },
});
</script>
```

### Inspect Composable Return Value

```typescript
<script setup lang="ts">
const wizard = useWizard({ definition, initialData });
console.log(wizard); // See all slices: state, validation, navigation, loading, actions
</script>
```

### Use Vue DevTools

Install Vue DevTools browser extension to inspect composable state in real-time.

### Enable Debug Mode

```typescript
<script setup lang="ts">
const wizard = useWizard({
  definition,
  initialData,
  context: { debug: true },
});
</script>
```

## Troubleshooting

### Wizard won't move to next step

Check:

- Is validation passing? (`validation.isValid.value`)
- Are all required fields filled?
- Is there an `onError` handler showing errors?

### Data not updating

Check:

- Are you using `actions.updateField()` correctly?
- Is the field name correct?
- Use `console.log(state.data.value)` to inspect

### Context not available

Check:

- Did you pass `context` to `useWizard()`?
- Are you casting correctly? `ctx as MyContext`
- Is the context value set?

## Performance Optimization

### Memoize Sub-Components

```typescript
<script setup lang="ts">
import { defineComponent, computed } from "vue";
</script>

<script lang="ts">
export default defineComponent({
  name: "PersonalStep",
  props: ["data", "onUpdate"],
  setup(props) {
    // Computed properties for optimization
    return {};
  },
});
</script>
```

### Avoid Inline Object Creation

```typescript
<!-- ❌ Don't: Creates new object every render -->
<script setup lang="ts">
const wizard = useWizard({
  definition,
  initialData: { name: "", email: "" },
});
</script>

<!-- ✅ Do: Move outside component -->
<script setup lang="ts">
const wizard = useWizard({
  definition,
  initialData,
});
</script>

<script lang="ts">
// Module scope - created once
const initialData = { name: "", email: "" };
</script>
```

### Use Computed Properties

```typescript
<script setup lang="ts">
const { state } = useWizard({ definition, initialData });

// Computed for derived state
const displayName = computed(() => {
  return `${state.data.value.firstName} ${state.data.value.lastName}`;
});
</script>
```

### Lazy Load Step Components

```typescript
<script setup lang="ts">
import { defineAsyncComponent } from "vue";

const PersonalStep = defineAsyncComponent(() => import("./PersonalStep.vue"));
const AddressStep = defineAsyncComponent(() => import("./AddressStep.vue"));
</script>

<template>
  <component
    :is="state.currentStepId.value === 'personal' ? PersonalStep : AddressStep"
    v-bind="$attrs"
  />
</template>
```
