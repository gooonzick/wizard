---
title: Core API
description: API reference for the @gooonzick/wizard-core package
---

# Core Package (`@gooonzick/wizard-core`)

## Base Types

### WizardDefinition

Complete wizard configuration.

```ts
interface WizardDefinition<T> {
  id: string;
  initialStepId: StepId;
  steps: Record<StepId, WizardStepDefinition<T>>;
  onComplete?: CompleteHandler<T>;
}
```

**Example:**

```ts
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

### WizardStepDefinition

Configuration for a single step.

```ts
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

```ts
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

### WizardState

Current snapshot of wizard state.

```ts
interface WizardState<T> {
  currentStepId: StepId;
  data: T;
  isValid: boolean;
  isCompleted: boolean;
  validationErrors?: Record<string, string>;
}
```

### `ValidationResult`

Result of validation.

```ts
interface ValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
}
```

### `WizardContext`

Context passed to validators, hooks, and transitions. Extensible.

```ts
interface WizardContext {
  debug?: boolean;
  signal?: AbortSignal;
  [key: string]: unknown;
}
```

### `StepMeta`

Metadata for step display.

```ts
interface StepMeta {
  [key: string]: unknown;
}
```

### SyncOrAsync

Type alias for sync or async operations.

```ts
type SyncOrAsync<T> = T | Promise<T>;
```

---

## Validator Types

### Validator

Function that validates step data.

```ts
type Validator<T> = (
  data: T,
  ctx: WizardContext,
) => SyncOrAsync<ValidationResult>;
```

### Validator Utilities

#### `combineValidators(...validators)`

Combine multiple validators (all must pass).

```ts
const combined = combineValidators(
  requiredFields("name", "email"),
  createValidator((data) => data.age >= 18, "Must be 18+", "age"),
);
```

#### `requiredFields(...fields, options?)`

Create validator for required fields.

```ts
const validator = requiredFields("name", "email");
```

**Options:**

```ts
interface RequiredFieldsOptions<T> {
  /** Custom error messages per field */
  messages?: Partial<Record<keyof T, string>>;
  /** Default message template. Use {field} as placeholder */
  defaultMessage?: string;
}
```

**Example:**

```ts
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

#### `createValidator(predicate, errorMsg, fieldName?)`

Create a simple predicate-based validator.

```ts
const emailValidator = createValidator(
  (data) => data.email?.includes("@"),
  "Invalid email format",
  "email",
);
```

#### `alwaysValid`

Validator that always passes.

```ts
const step = {
  validate: alwaysValid,
};
```

#### `createStandardSchemaValidator(schema, options?)`

Wrap Standard Schema validators (Valibot, ArkType, etc.).

```ts
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";

const validator = createStandardSchemaValidator(mySchema);

// Custom issue mapping
const custom = createStandardSchemaValidator(mySchema, {
  mapIssueToField: (issue) => issue.path?.[0]?.toString(),
});
```

**Options:**

```ts
interface StandardSchemaValidatorOptions {
  mapIssueToField?: (issue: any) => string | undefined;
}
```

---

## Transition Types

### StepTransition

Union of transition types.

```ts
type StepTransition<T> =
  | StaticTransition
  | ConditionalTransition<T>
  | ResolverTransition<T>
  | null;
```

### `StaticTransition`

Direct transition to a step.

```ts
interface StaticTransition {
  type: "static";
  to: StepId;
}
```

**Example:**

```ts
next: { type: "static", to: "contact-info" }
```

### ConditionalTransition

Branch based on conditions.

```ts
interface ConditionalTransition<T> {
  type: "conditional";
  branches: ConditionalBranch<T>[];
}

interface ConditionalBranch<T> {
  when: StepGuard<T>;
  to: StepId;
}
```

### ResolverTransition

Dynamic resolution via async function.

### StepGuard

Predicate for step availability.

```ts
type StepGuard&lt;T&gt; = (data: T, ctx: WizardContext) => SyncOrAsync&lt;boolean&gt;;
```

---

## Transition Utilities

### `resolveTransition(transition, data, ctx)`

Resolve a transition to a step ID.

```ts
const nextStepId = await resolveTransition(step.next, data, context);
```

### `evaluateGuard(guard, data, ctx)`

Evaluate a guard (handles boolean or function).

```ts
const isEnabled = await evaluateGuard(step.enabled, data, context);
```

### `andGuards(...guards)`

Combine guards with AND logic.

```ts
const isPremium = (d) => d.plan === "premium";
const hasAccess = (d) => d.accessLevel >= 2;

enabled: andGuards(isPremium, hasAccess);
```

### `orGuards(...guards)`

Combine guards with OR logic.

```ts
const isPremium = (d) => d.plan === "premium";
const isAdmin = (d) => d.role === "admin";

enabled: orGuards(isPremium, isAdmin);
```

### `notGuard(guard)`

Negate a guard.

```ts
const isBeta = (d) => d.beta === true;

enabled: notGuard(isBeta); // Only show if NOT beta
```

---

## WizardMachine

The state machine that orchestrates the wizard.

```ts
class WizardMachine<T> {
  // State accessors
  snapshot: WizardState<T>; // getter
  visited: StepId[]; // getter
  history: StepId[]; // getter
  isBusy: boolean; // getter
  currentStep: WizardStepDefinition<T>; // getter

  // Data operations
  updateData(updater: (data: T) => T): void;
  setData(data: T): void;

  // Validation & submission
  validate(): Promise<void>;
  canSubmit(): Promise<boolean>;
  submit(): Promise<void>;

  // Navigation
  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  goBack(steps?: number): Promise<void>;
  goToStep(stepId: StepId): Promise<void>;

  // Query
  getNextStepId(): Promise<StepId | null>;
  getPreviousStepId(): Promise<StepId | null>;
  canNavigateToStep(stepId: StepId): Promise<boolean>;
  getAvailableSteps(): Promise<StepId[]>; // Note: async
}
```

### Constructor

```ts
constructor(
  definition: WizardDefinition<T>,
  context: WizardContext = {},
  initialData: T,
  events?: WizardEvents<T>
)
```

### Events

```ts
interface WizardEvents<T> {
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: StepId, data: T) => void;
  onStepLeave?: (stepId: StepId, data: T) => void;
  onValidation?: (result: ValidationResult) => void;
  onSubmit?: (stepId: StepId, data: T) => void;
  onComplete?: (data: T) => void;
  onError?: (error: Error) => void;
}
```

**Example:**

```ts
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    console.log("Current step:", state.currentStepId);
  },
  onError: (error) => {
    console.error("Error:", error);
  },
});
```

---

## Builders

### `createStep(id)`

Create a step using fluent API.

```ts
const step = createStep<MyData>("personal")
  .title("Personal Info")
  .description("Tell us about yourself")
  .required("name", "email")
  .next("contact")
  .onEnter(async (data, ctx) => {
    /* ... */
  })
  .build();
```

**Methods:**

- `.title(string)` - Set step title (metadata)
- `.description(string)` - Set step description (metadata)
- `.icon(string)` - Set step icon (metadata)
- `.meta(object)` - Set custom metadata
- `.enabled(boolean | StepGuard&lt;T&gt;)` - Set availability
- `.validate(Validator&lt;T&gt;)` - Set validator
- `.required(...fields, options?)` - Add required fields validator
- `.validateWithSchema(schema)` - Add schema validator
- `.next(StepId | StepTransition&lt;T&gt;)` - Set next transition
- `.nextWhen(ConditionalBranch&lt;T&gt;[])` - Set conditional next
- `.nextResolver(StepTransitionResolver&lt;T&gt;)` - Set resolver next
- `.previous(StepId | StepTransition&lt;T&gt;)` - Set previous transition
- `.onEnter(LifecycleHook&lt;T&gt;)` - Set enter hook
- `.onLeave(LifecycleHook&lt;T&gt;)` - Set leave hook
- `.onSubmit(SubmitHandler&lt;T&gt;)` - Set submit handler
- `.build()` - Return WizardStepDefinition&lt;T&gt;

### `createWizard(id)`

Create a wizard using fluent API.

```ts
const wizard = createWizard<MyData>("signup")
  .initialStep("personal")
  .step("personal", (s) => s.title("Personal").next("contact"))
  .step("contact", (s) => s.title("Contact").previous("personal"))
  .onComplete(async (data) => {
    /* ... */
  })
  .build();
```

**Methods:**

- `.initialStep(stepId)` - Set starting step
- `.step(stepId, configFn)` - Add/configure step
- `.addStep(definition)` - Add existing step definition
- `.sequence([...])` - Add multiple steps in sequence
- `.onComplete(CompleteHandler&lt;T&gt;)` - Set completion handler
- `.build()` - Return WizardDefinition&lt;T&gt;

### `createLinearWizard(config)`

Create a linear wizard (no branching).

```ts
const wizard = createLinearWizard<MyData>({
  id: "signup",
  steps: [
    {
      id: "personal",
      title: "Personal",
      validate: (data) => ({ valid: Boolean(data.name) }),
    },
    {
      id: "contact",
      title: "Contact",
      validate: (data) => ({ valid: Boolean(data.email) }),
    },
  ],
  onComplete: async (data) => {
    /* ... */
  },
});
```

**Config:**

```ts
interface LinearWizardConfig<T> {
  id: string;
  steps: LinearStep<T>[];
  onComplete?: CompleteHandler<T>;
}

interface LinearStep<T> {
  id: StepId;
  title?: string;
  description?: string;
  meta?: StepMeta;
  validate?: Validator<T>;
  onEnter?: LifecycleHook<T>;
  onLeave?: LifecycleHook<T>;
  onSubmit?: SubmitHandler<T>;
}
```

---

## Context Utilities

### `createWizardContext(values?)`

Create a base context with optional extensions.

```ts
const ctx = createWizardContext({
  debug: true,
  api: myApiClient,
});
```

### `ExtendContext`

Helper type for extending context.

```ts
interface ExtendContext extends WizardContext {
  [key: string]: unknown;
}
```

### `LoggerContext`

Helper interface for logger context.

```ts
interface LoggerContext extends WizardContext {
  logger?: {
    log: (msg: string) => void;
    error: (msg: string) => void;
  };
}
```

### `RouterContext`

Helper interface for router context.

```ts
interface RouterContext extends WizardContext {
  router?: {
    navigate: (path: string) => void | Promise<void>;
  };
}
```

### `ApiContext`

Helper interface for API context.

```ts
interface ApiContext extends WizardContext {
  api?: {
    [key: string]: (...args: any[]) => Promise<any>;
  };
}
```

---

## Error Classes

### `WizardError`

Base error class.

```ts
class WizardError extends Error {
  constructor(message: string);
}
```

### `WizardValidationError`

Validation failed.

```ts
class WizardValidationError extends WizardError {
  errors: Record<string, string>;

  constructor(errors: Record<string, string>);
}
```

### `WizardNavigationError`

Navigation failed.

```ts
class WizardNavigationError extends WizardError {
  stepId: StepId;
  reason: "disabled" | "not-found" | "busy" | "circular";

  constructor(stepId: StepId, reason: string);
}
```

### `WizardConfigurationError`

Invalid configuration.

```ts
class WizardConfigurationError extends WizardError {
  constructor(message: string);
}
```

### `WizardAbortError`

Operation aborted via signal.

```ts
class WizardAbortError extends WizardError {
  constructor(message: string);
}
```

---

## Type Aliases

### `StepId`

Unique identifier for a step.

```ts
type StepId = string;
```

### CompleteHandler

Handler called when wizard completes.

```ts
type CompleteHandler<T> = (data: T, ctx: WizardContext) => SyncOrAsync<void>;
```

### SubmitHandler

Handler called when step is submitted.

```ts
type SubmitHandler<T> = (data: T, ctx: WizardContext) => SyncOrAsync<void>;
```

### LifecycleHook

Hook called at step lifecycle events.

```ts
type LifecycleHook<T> = (data: T, ctx: WizardContext) => SyncOrAsync<void>;
```

---

## Common Usage Patterns

### Query Step Information

```ts
const machine = new WizardMachine(definition, context, initialData);

// Get current step (getter, not a method)
const step = machine.currentStep;

// Get current state snapshot
const state = machine.snapshot;

// Get available next steps
const nextId = await machine.getNextStepId();

// Check if can go to step
const canGo = await machine.canNavigateToStep("step-id");

// Get all available steps (async)
const available = await machine.getAvailableSteps();
```

### Update Data and Validate

```ts
// Update one field
machine.updateData((d) => ({ ...d, name: "John" }));

// Replace all data
machine.setData({ name: "Jane", email: "jane@example.com" });

// Validate
const result = await machine.validate();
if (result.valid) {
  await machine.goNext();
}
```

### Navigate Between Steps

```ts
// Go forward
await machine.goNext();

// Go backward
await machine.goPrevious();

// Jump steps
await machine.goBack(3);

// Jump to specific step
await machine.goToStep("step-id");
```

### Handle Events

```ts
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    // React state update, Vue watch, etc.
  },
  onError: (error) => {
    // Show error to user
  },
  onComplete: (data) => {
    // Cleanup, redirect, etc.
  },
});
```
