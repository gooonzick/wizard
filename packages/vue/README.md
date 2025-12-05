# @gooonzick/wizard-vue

Vue 3 Composition API integration for the Wizard framework.

## Installation

```bash
npm install @gooonzick/wizard-vue @gooonzick/wizard-core
# or
pnpm add @gooonzick/wizard-vue @gooonzick/wizard-core
# or
yarn add @gooonzick/wizard-vue @gooonzick/wizard-core
```

## Quick Start

### Basic Usage with Composition API

```vue
<script setup lang="ts">
import { useWizard } from "@gooonzick/wizard-vue";
import { createLinearWizard } from "@gooonzick/wizard-core";

interface FormData {
  name: string;
  email: string;
  age: number;
}

const definition = createLinearWizard<FormData>({
  id: "my-wizard",
  steps: [
    { id: "personal", title: "Personal Info" },
    { id: "contact", title: "Contact" },
    { id: "review", title: "Review" },
  ],
});

const { state, navigation, actions } = useWizard({
  definition,
  initialData: { name: "", email: "", age: 0 },
});
</script>

<template>
  <div>
    <h2>{{ state.currentStep.value?.title }}</h2>

    <div v-if="state.currentStepId.value === 'personal'">
      <input
        :value="state.data.value.name"
        @input="
          actions.updateField('name', ($event.target as HTMLInputElement).value)
        "
        placeholder="Name"
      />
    </div>

    <div v-else-if="state.currentStepId.value === 'contact'">
      <input
        :value="state.data.value.email"
        @input="
          actions.updateField(
            'email',
            ($event.target as HTMLInputElement).value,
          )
        "
        placeholder="Email"
      />
    </div>

    <div v-else-if="state.currentStepId.value === 'review'">
      <p>Name: {{ state.data.value.name }}</p>
      <p>Email: {{ state.data.value.email }}</p>
    </div>

    <button
      @click="navigation.goPrevious"
      :disabled="!navigation.canGoPrevious.value"
    >
      Previous
    </button>

    <button @click="navigation.goNext" :disabled="!navigation.canGoNext.value">
      Next
    </button>
  </div>
</template>
```

### Using WizardProvider for Shared State

```vue
<!-- App.vue -->
<script setup lang="ts">
import { WizardProvider } from "@gooonzick/wizard-vue";
import { createLinearWizard } from "@gooonzick/wizard-core";
import WizardSteps from "./WizardSteps.vue";
import WizardNavigation from "./WizardNavigation.vue";

const definition = createLinearWizard({
  id: "my-wizard",
  steps: [
    { id: "step1", title: "Step 1" },
    { id: "step2", title: "Step 2" },
  ],
});
</script>

<template>
  <WizardProvider :definition="definition" :initialData="{ name: '' }">
    <WizardSteps />
    <WizardNavigation />
  </WizardProvider>
</template>
```

```vue
<!-- WizardSteps.vue -->
<script setup lang="ts">
import { useWizardData, useWizardActions } from "@gooonzick/wizard-vue";

const { currentStepId, data } = useWizardData();
const { updateField } = useWizardActions();
</script>

<template>
  <div>
    <h2>Current: {{ currentStepId.value }}</h2>
    <input
      :value="data.value.name"
      @input="updateField('name', $event.target.value)"
    />
  </div>
</template>
```

```vue
<!-- WizardNavigation.vue -->
<script setup lang="ts">
import { useWizardNavigation } from "@gooonzick/wizard-vue";

const { canGoNext, canGoPrevious, goNext, goPrevious } = useWizardNavigation();
</script>

<template>
  <div>
    <button @click="goPrevious" :disabled="!canGoPrevious.value">
      Previous
    </button>
    <button @click="goNext" :disabled="!canGoNext.value">Next</button>
  </div>
</template>
```

## API Reference

### Composables

#### `useWizard(options)`

Main composable for wizard state management. Returns organized state slices.

**Parameters:**

- `definition: WizardDefinition<T>` - Wizard configuration
- `initialData: T` - Initial form data
- `context?: WizardContext` - Optional context for validators/hooks
- `onStateChange?: (state) => void` - State change callback
- `onStepEnter?: (stepId, data) => void` - Step enter callback
- `onStepLeave?: (stepId, data) => void` - Step leave callback
- `onComplete?: (data) => void` - Completion callback
- `onError?: (error) => void` - Error callback

**Returns:**

- `state` - Current step and data (reactive refs)
- `validation` - Validation state and errors
- `navigation` - Navigation state and methods
- `loading` - Async operation states
- `actions` - Data mutations and validation

#### Granular Composables (require WizardProvider)

- `useWizardData<T>()` - State slice only
- `useWizardNavigation()` - Navigation slice only
- `useWizardValidation()` - Validation slice only
- `useWizardLoading()` - Loading slice only
- `useWizardActions<T>()` - Actions slice only

### Components

#### `WizardProvider`

Provider component for sharing wizard state via provide/inject.

**Props:** Same as `useWizard` options, plus `children`

## TypeScript Support

All composables and components are fully typed with TypeScript generics:

```typescript
interface MyFormData {
  name: string;
  email: string;
}

const { state, actions } = useWizard<MyFormData>({
  definition,
  initialData: { name: "", email: "" },
});

// TypeScript knows the shape of data
actions.updateField("name", "John"); // ✓ OK
actions.updateField("invalid", "value"); // ✗ Error
```

## License

MIT
