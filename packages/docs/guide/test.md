---
title: API Reference
description: Complete reference for all public types and functions
---

# API Reference

Complete reference for all public types and functions in `@gooonzick/wizard-core` and `@gooonzick/wizard-react`.

## Core Package (`@gooonzick/wizard-core`)

### Base Types

#### `WizardDefinition<T>`

Complete wizard configuration.

```typescript
interface WizardDefinition<T> {
  id: string;
  initialStepId: StepId;
  steps: Record<StepId, WizardStepDefinition<T>>;
  onComplete?: CompleteHandler<T>;
}
```

**Example:**

```typescript
const definition: WizardDefinition<MyData> = {
  id: "my-wizard",
  initialStepId: "step1",
  steps: {
    /* ... */
  },
  onComplete: async (data, ctx) => {
    /* ... */
  },
};
```

#### `WizardStepDefinition<T>`

Configuration for a single step.

```typescript
interface WizardStepDefinition<T> {
  id: StepId;
  previous?: StepTransition<T>;
  next?: StepTransition<T>;
  enabled?: boolean | StepGuard<T>;
  validate?: Validator<T>;
  onEnter?: LifecycleHook<T>;
  onLeave?: LifecycleHook<T>;
  onSubmit?: SubmitHandler<T>;
  meta?: StepMeta;
}
```

**Example:**

```typescript
const step: WizardStepDefinition<MyData> = {
  id: "personal",
  title: "Personal Info",
  validate: (data) => ({
    valid: Boolean(data.name),
    errors: data.name ? undefined : { name: "Required" },
  }),
  next: { type: "static", to: "contact" },
};
```

#### `WizardState<T>`

Current snapshot of wizard state.

```typescript
interface WizardState<T> {
  currentStepId: StepId;
  data: T;
  isValid: boolean;
  isCompleted: boolean;
  validationErrors?: Record<string, string>;
}
```

#### `ValidationResult`

Result of validation.

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}
```

#### `WizardContext`

Context passed to validators, hooks, and transitions. Extensible.

```typescript
interface WizardContext {
  debug?: boolean;
  signal?: AbortSignal;
  [key: string]: unknown;
}
```

#### `StepMeta`

Metadata for step display.

```typescript
interface StepMeta {
  [key: string]: unknown;
}
```

#### `SyncOrAsync<T>`

Type alias for sync or async operations.

```typescript
type SyncOrAsync<T> = T | Promise<T>;
```

---

### Validator Types

#### `Validator<T>`

Function that validates step data.

```typescript
type Validator<T> = (
  data: T,
  ctx: WizardContext,
) => SyncOrAsync<ValidationResult>;
```

#### `Validator Utilities`

##### `combineValidators(...validators)`

Combine multiple validators (all must pass).

```typescript
const combined = combineValidators(
  requiredFields("name", "email"),
  createValidator((data) => data.age >= 18, "Must be 18+", "age"),
);
```

##### `requiredFields(...fields, options?)`

Create validator for required fields.

```typescript
const validator = requiredFields("name", "email");
```

**Options:**

```typescript
interface RequiredFieldsOptions<T> {
  /** Custom error messages per field */
  messages?: Partial<Record<keyof T, string>>;
  /** Default message template. Use {field} as placeholder */
  defaultMessage?: string;
}
```

**Example:**

```typescript
// Default messages
requiredFields("name", "email");

// Custom messages per field
requiredFields("name", "email", {
  messages: {
    name: "Your name is required",
    email: "Email address is required",
  },
});

// Custom default message template
requiredFields("name", "email", {
  defaultMessage: "{field} cannot be empty",
});
```

##### `createValidator(predicate, errorMsg, fieldName?)`

Create a simple predicate-based validator.

```typescript
const emailValidator = createValidator(
  (data) => data.email?.includes("@"),
  "Invalid email format",
  "email",
);
```

##### `alwaysValid`

Validator that always passes.

```typescript
const step = {
  validate: alwaysValid,
};
```

##### `createStandardSchemaValidator(schema, options?)`

Wrap Standard Schema validators (Valibot, ArkType, etc.).

```typescript
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";

const validator = createStandardSchemaValidator(mySchema);

// Custom issue mapping
const custom = createStandardSchemaValidator(mySchema, {
  mapIssueToField: (issue) => issue.path?.[0]?.toString(),
});
```

**Options:**

```typescript
interface StandardSchemaValidatorOptions {
  mapIssueToField?: (issue: any) => string | undefined;
}
```

---

### Transition Types

#### `StepTransition<T>`

Union of transition types.

```typescript
type StepTransition<T> =
  | StaticTransition
  | ConditionalTransition<T>
  | ResolverTransition<T>
  | null;
```

#### `StaticTransition`

Direct transition to a step.

```typescript
interface StaticTransition {
  type: "static";
  to: StepId;
}
```

**Example:**

```typescript
next: { type: "static", to: "contact-info" }
```

#### `ConditionalTransition<T>`

Branch based on conditions.

```typescript
interface ConditionalTransition<T> {
  type: "conditional";
