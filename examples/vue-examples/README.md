# Vue 3 Wizard Examples

A comprehensive Vue 3 application demonstrating advanced multi-step wizard patterns using `@gooonzick/wizard-vue` and `@gooonzick/wizard-core`.

## Features Demonstrated

### Core Features
- ✅ Multi-step wizard navigation with progress tracking
- ✅ Form validation with custom validators
- ✅ Two integration approaches: `useWizard` hook and `WizardProvider` with granular hooks
- ✅ TypeScript support with full type safety
- ✅ Reactive state management
- ✅ Step completion tracking

### Advanced Features
- ✅ **Sync Transitions** - Direct step-to-step navigation
- ✅ **Conditional Transitions** - Dynamic routing based on data conditions (`nextWhen`)
- ✅ **Dynamic Transitions** - Async resolvers for complex routing logic
- ✅ **Custom Validators** - Composable validation functions
- ✅ **Guard Combinators** - Boolean logic for step conditions
- ✅ **Guard-based Step Enabling** - Show/hide steps based on state
- ✅ Live data preview sidebar

### Two Approaches
- ✅ `useWizard` - Direct, all-in-one hook
- ✅ `WizardProvider` + Granular Hooks - Provider pattern for performance optimization

## Getting Started

### Step 1: Install dependencies

From the monorepo root, install all dependencies:

```bash
cd /path/to/wizard-vite
pnpm install
```

### Step 2: Start development server

Navigate to the Vue examples directory and start the dev server:

```bash
cd examples/vue-examples
pnpm dev
```

### Step 3: Open browser

Open your browser at the URL shown in the terminal (usually `http://localhost:5173`).

## Technologies

- **Vue 3.5** - Progressive JavaScript framework with Composition API
- **TypeScript 5.9** - Type-safe JavaScript
- **Tailwind CSS v4** - Utility-first CSS framework
- **@gooonzick/wizard-vue** - Vue integration for wizard machine
- **@gooonzick/wizard-core** - Framework-agnostic wizard state machine
- **lucide-vue-next** - Beautiful icon library
- **rolldown-vite** - Fast bundler (Vite with Rolldown)
- **Biome** - Fast formatter and linter

## Project Structure

```
examples/vue-examples/
├── src/
│   ├── wizard-example/
│   │   ├── wizard-definition.ts      # Wizard step configuration
│   │   ├── use-wizard-example.vue    # Direct useWizard hook approach
│   │   ├── provider-example.vue      # WizardProvider approach
│   │   ├── validators.ts             # Custom validators
│   │   ├── guards.ts                 # Guard functions
│   │   └── initial-data.ts           # Default wizard data
│   ├── types/
│   │   └── wizard-data.ts            # TypeScript interfaces
│   ├── components/
│   │   ├── wizard-form.vue           # Form component with validation
│   │   ├── wizard-sidebar.vue        # Live data preview
│   │   └── ui/                       # Reusable UI components
│   │       ├── button.vue
│   │       ├── card.vue
│   │       ├── checkbox.vue
│   │       ├── label.vue
│   │       ├── progress.vue
│   │       ├── alert.vue
│   │       └── validation-message.vue
│   ├── App.vue                       # Main application component
│   └── main.ts                       # Application entry point
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
└── README.md
```

## Wizard Steps

The example wizard demonstrates a 7-step registration flow:

1. **Personal Information** - Collect name, email, and phone
2. **Preferences** - Set newsletter, notifications, and theme
3. **Account Setup** - Create username and password with confirmation
4. **Business Information** - Company details (conditional, based on selections)
5. **Select Your Plan** - Choose subscription tier with conditional routing
6. **Contact Sales** - Enterprise contact form (only for enterprise plan)
7. **Review & Submit** - Final review before submission

## Advanced Features Explained

### Sync Transitions

Simple direct navigation between steps:

```typescript
.step("preferences", (step) => {
  step
    .title("Preferences")
    .next("account")
    .previous("personal");
})
```

### Conditional Transitions (nextWhen)

Dynamic routing based on data conditions:

```typescript
.step("plan", (step) => {
  step
    .title("Select Your Plan")
    .required("plan")
    .nextWhen([
      {
        when: enterpriseEligible,
        to: "contact",
      },
      {
        when: (data) => data.plan === "pro",
        to: "review",
      },
      {
        when: (data) => data.plan === "starter" || data.plan === "free",
        to: "review",
      },
    ]);
})
```

### Dynamic Transitions (resolver)

Async resolvers for complex routing logic:

```typescript
.step("review", (step) => {
  step
    .title("Review & Submit")
    .nextResolver((data) => {
      if (data.plan === "enterprise") {
        return "contact";
      }
      if (data.plan === "pro" || data.companyName) {
        return "plan";
      }
      return "account";
    });
})
```

### Custom Validators

Composable validation functions:

```typescript
import { requiredFields } from "@gooonzick/wizard-core";

export const emailValidator = (data: RegistrationData): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return {
      valid: false,
      errors: { email: "Please enter a valid email address" },
    };
  }
  return { valid: true };
};

export const passwordMatchValidator = (
  data: RegistrationData,
): ValidationResult => {
  if (data.password !== data.confirmPassword) {
    return {
      valid: false,
      errors: { confirmPassword: "Passwords do not match" },
    };
  }
  return { valid: true };
};
```

### Guard Combinators

Boolean logic for complex conditions:

```typescript
import { andGuards, orGuards } from "@gooonzick/wizard-core";

export const enterpriseEligible = (data: RegistrationData): boolean => {
  return andGuards(
    (d: RegistrationData) => d.plan === "enterprise",
    (d: RegistrationData) => !!d.companyName,
  )(data);
};

export const businessComplete = (data: RegistrationData): boolean => {
  return andGuards(
    (d: RegistrationData) => !!d.companyName,
    (d: RegistrationData) => !!d.companySize,
  )(data);
};
```

### Guard-based Step Enabling

Show/hide steps based on conditions:

```typescript
.step("business", (step) => {
  step
    .title("Business Information")
    .enabled(businessComplete)  // Step only shows when guard passes
    .next("plan")
    .previous("account");
})
```

## Two Approaches

### Approach 1: useWizard (Direct)

Use `useWizard` for simple wizards where you need all wizard functionality in one place:

```vue
<script setup lang="ts">
import { useWizard } from "@gooonzick/wizard-vue";
import { advancedWizard } from "./wizard-definition";
import { initialData } from "./initial-data";

const { navigation, actions, state, validation } = useWizard({
  definition: advancedWizard,
  initialData,
  onComplete: (finalData) => {
    console.log("Wizard Completed!", finalData);
  },
});
</script>

<template>
  <div>
    <h1>{{ state.currentStepId }}</h1>
    <button @click="navigation.goNext" :disabled="!navigation.canGoNext">
      Next
    </button>
    <button @click="actions.updateField('firstName', 'John')">
      Update Field
    </button>
  </div>
</template>
```

**When to use:**
- Simple wizard implementations
- When you don't need performance optimization
- When all components need wizard access

### Approach 2: WizardProvider + Granular Hooks

Use `WizardProvider` with granular hooks for performance optimization in complex applications:

```vue
<script setup lang="ts">
import { WizardProvider } from "@gooonzick/wizard-vue";
import { advancedWizard } from "./wizard-definition";
import { initialData } from "./initial-data";
</script>

<template>
  <WizardProvider
    :definition="advancedWizard"
    :initial-data="initialData"
    :on-complete="(data) => console.log('Complete!', data)"
  >
    <!-- Child components use granular hooks -->
    <WizardForm />
    <WizardControls />
  </WizardProvider>
</template>
```

Child component with granular hook:

```vue
<script setup lang="ts">
import { useWizardNavigation } from "@gooonzick/wizard-vue";

const { canGoNext, goNext, isLastStep } = useWizardNavigation();
</script>

<template>
  <button @click="goNext" :disabled="!canGoNext">Next</button>
</template>
```

**When to use:**
- Large applications with many wizard components
- When you want to prevent unnecessary re-renders
- When you want to encapsulate wizard logic in specific components

## Type Safety

Full TypeScript support with type inference:

```typescript
// Define your wizard data type
export interface RegistrationData extends Record<string, unknown> {
  firstName: string;
  lastName: string;
  email: string;
  plan?: "free" | "starter" | "pro" | "enterprise";
  // ... other fields
}

// Wizard definition is fully typed
export const advancedWizard = createWizard<RegistrationData>("registration")
  .step("personal", (step) => {
    step
      .title("Personal Information")
      .required("firstName", "lastName", "email")  // Type-checked!
      .validate((data) => {
        // data is inferred as RegistrationData
        return { valid: true };
      })
      .next("preferences");
  })
  .build();

// Hook returns typed values
const { state, actions } = useWizard({
  definition: advancedWizard,
  // ... options
});

// state.data.value is typed as RegistrationData
const firstName = state.data.value.firstName;  // ✅ Type-safe
const invalidField = state.data.value.nonExistent;  // ❌ TypeScript error
```

## Building for Production

Build the Vue examples for production:

```bash
cd examples/vue-examples
pnpm build
```

The production build will be in the `dist/` directory.

## Quality Checks

Run quality checks before committing:

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Fix lint issues automatically
pnpm lint:fix
```

## Learn More

- **@gooonzick/wizard-vue** - Vue integration package documentation
- **@gooonzick/wizard-core** - Core wizard state machine API
- **Vue 3 Documentation** - https://vuejs.org/
- **TypeScript** - https://www.typescriptlang.org/
- **Tailwind CSS** - https://tailwindcss.com/
