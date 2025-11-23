# API Reference

Complete reference for all public types and functions in `@wizard/core` and `@wizard/react`.

## Core Package (`@wizard/core`)

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
  steps: { /* ... */ },
  onComplete: async (data, ctx) => { /* ... */ },
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
  ctx: WizardContext
) => SyncOrAsync<ValidationResult>;
```

#### `Validator Utilities`

##### `combineValidators(...validators)`
Combine multiple validators (all must pass).

```typescript
const combined = combineValidators(
  requiredFields("name", "email"),
  createValidator((data) => data.age >= 18, "Must be 18+", "age")
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
  "email"
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
import { createStandardSchemaValidator } from "@wizard/core";

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
  branches: ConditionalBranch<T>[];
}

interface ConditionalBranch<T> {
  when: StepGuard<T>;
  to: StepId;
}
```

**Example:**
```typescript
next: {
  type: "conditional",
  branches: [
    { when: (d) => d.isPremium, to: "premium-setup" },
    { when: () => true, to: "standard-setup" },
  ],
}
```

#### `ResolverTransition<T>`
Dynamic resolution via async function.

```typescript
interface ResolverTransition<T> {
  type: "resolver";
  resolve: StepTransitionResolver<T>;
}

type StepTransitionResolver<T> = (
  data: T,
  ctx: WizardContext
) => SyncOrAsync<StepId | null>;
```

**Example:**
```typescript
next: {
  type: "resolver",
  resolve: async (data, ctx) => {
    const plan = await ctx.api.getPlan(data.userId);
    return plan.type === "enterprise" ? "enterprise-setup" : "basic-setup";
  },
}
```

#### `StepGuard<T>`
Predicate for step availability.

```typescript
type StepGuard<T> = (
  data: T,
  ctx: WizardContext
) => SyncOrAsync<boolean>;
```

---

### Transition Utilities

#### `resolveTransition(transition, data, ctx)`
Resolve a transition to a step ID.

```typescript
const nextStepId = await resolveTransition(
  step.next,
  data,
  context
);
```

#### `evaluateGuard(guard, data, ctx)`
Evaluate a guard (handles boolean or function).

```typescript
const isEnabled = await evaluateGuard(
  step.enabled,
  data,
  context
);
```

#### `andGuards(...guards)`
Combine guards with AND logic.

```typescript
const isPremium = (d) => d.plan === "premium";
const hasAccess = (d) => d.accessLevel >= 2;

enabled: andGuards(isPremium, hasAccess);
```

#### `orGuards(...guards)`
Combine guards with OR logic.

```typescript
const isPremium = (d) => d.plan === "premium";
const isAdmin = (d) => d.role === "admin";

enabled: orGuards(isPremium, isAdmin);
```

#### `notGuard(guard)`
Negate a guard.

```typescript
const isBeta = (d) => d.beta === true;

enabled: notGuard(isBeta); // Only show if NOT beta
```

---

### WizardMachine

The state machine that orchestrates the wizard.

```typescript
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

#### Constructor

```typescript
constructor(
  definition: WizardDefinition<T>,
  context: WizardContext = {},
  initialData: T,
  events?: WizardEvents<T>
)
```

#### Events

```typescript
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
```typescript
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

### Builders

#### `createStep(id)`
Create a step using fluent API.

```typescript
const step = createStep<MyData>("personal")
  .title("Personal Info")
  .description("Tell us about yourself")
  .required("name", "email")
  .next("contact")
  .onEnter(async (data, ctx) => { /* ... */ })
  .build();
```

**Methods:**
- `.title(string)` - Set step title (metadata)
- `.description(string)` - Set step description (metadata)
- `.icon(string)` - Set step icon (metadata)
- `.meta(object)` - Set custom metadata
- `.enabled(boolean | StepGuard<T>)` - Set availability
- `.validate(Validator<T>)` - Set validator
- `.required(...fields, options?)` - Add required fields validator
- `.validateWithSchema(schema)` - Add schema validator
- `.next(StepId | StepTransition<T>)` - Set next transition
- `.nextWhen(ConditionalBranch<T>[])` - Set conditional next
- `.nextResolver(StepTransitionResolver<T>)` - Set resolver next
- `.previous(StepId | StepTransition<T>)` - Set previous transition
- `.onEnter(LifecycleHook<T>)` - Set enter hook
- `.onLeave(LifecycleHook<T>)` - Set leave hook
- `.onSubmit(SubmitHandler<T>)` - Set submit handler
- `.build()` - Return WizardStepDefinition<T>

#### `createWizard(id)`
Create a wizard using fluent API.

```typescript
const wizard = createWizard<MyData>("signup")
  .initialStep("personal")
  .step("personal", (s) => s.title("Personal").next("contact"))
  .step("contact", (s) => s.title("Contact").previous("personal"))
  .onComplete(async (data) => { /* ... */ })
  .build();
```

**Methods:**
- `.initialStep(stepId)` - Set starting step
- `.step(stepId, configFn)` - Add/configure step
- `.addStep(definition)` - Add existing step definition
- `.sequence([...])` - Add multiple steps in sequence
- `.onComplete(CompleteHandler<T>)` - Set completion handler
- `.build()` - Return WizardDefinition<T>

#### `createLinearWizard(config)`
Create a linear wizard (no branching).

```typescript
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
  onComplete: async (data) => { /* ... */ },
});
```

**Config:**
```typescript
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

### Context Utilities

#### `createWizardContext(values?)`
Create a base context with optional extensions.

```typescript
const ctx = createWizardContext({
  debug: true,
  api: myApiClient,
});
```

#### `ExtendContext`
Helper type for extending context.

```typescript
interface ExtendContext extends WizardContext {
  [key: string]: unknown;
}
```

#### `LoggerContext`
Helper interface for logger context.

```typescript
interface LoggerContext extends WizardContext {
  logger?: {
    log: (msg: string) => void;
    error: (msg: string) => void;
  };
}
```

#### `RouterContext`
Helper interface for router context.

```typescript
interface RouterContext extends WizardContext {
  router?: {
    navigate: (path: string) => void | Promise<void>;
  };
}
```

#### `ApiContext`
Helper interface for API context.

```typescript
interface ApiContext extends WizardContext {
  api?: {
    [key: string]: (...args: any[]) => Promise<any>;
  };
}
```

---

### Error Classes

#### `WizardError`
Base error class.

```typescript
class WizardError extends Error {
  constructor(message: string);
}
```

#### `WizardValidationError`
Validation failed.

```typescript
class WizardValidationError extends WizardError {
  errors: Record<string, string>;

  constructor(errors: Record<string, string>);
}
```

#### `WizardNavigationError`
Navigation failed.

```typescript
class WizardNavigationError extends WizardError {
  stepId: StepId;
  reason: "disabled" | "not-found" | "busy" | "circular";

  constructor(stepId: StepId, reason: string);
}
```

#### `WizardConfigurationError`
Invalid configuration.

```typescript
class WizardConfigurationError extends WizardError {
  constructor(message: string);
}
```

#### `WizardAbortError`
Operation aborted via signal.

```typescript
class WizardAbortError extends WizardError {
  constructor(message: string);
}
```

---

## React Package (`@wizard/react`)

### useWizard Hook

```typescript
function useWizard<T extends Record<string, unknown>>(
  options: UseWizardOptions<T>
): UseWizardReturn<T>;
```

#### `UseWizardOptions<T>`

```typescript
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

#### `UseWizardReturn<T>`

The hook returns an organized object with five slices:

```typescript
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
```typescript
import { useWizard } from "@wizard/react";

const { state, navigation, actions, validation, loading } = useWizard({
  definition: myWizard,
  initialData: { name: "", email: "" },
  onComplete: (data) => {
    console.log("Completed:", data);
  },
});

// Use state.currentStep, state.data, navigation.goNext(), actions.updateField(), etc.
```

### Granular Hooks

For fine-grained subscriptions, use `WizardProvider` with these hooks:

```typescript
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

### WizardProvider

Context provider for sharing wizard state:

```typescript
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

---

## Type Aliases

### `StepId`
Unique identifier for a step.

```typescript
type StepId = string;
```

### `CompleteHandler<T>`
Handler called when wizard completes.

```typescript
type CompleteHandler<T> = (
  data: T,
  ctx: WizardContext
) => SyncOrAsync<void>;
```

### `SubmitHandler<T>`
Handler called when step is submitted.

```typescript
type SubmitHandler<T> = (
  data: T,
  ctx: WizardContext
) => SyncOrAsync<void>;
```

### `LifecycleHook<T>`
Hook called at step lifecycle events.

```typescript
type LifecycleHook<T> = (
  data: T,
  ctx: WizardContext
) => SyncOrAsync<void>;
```

---

## Common Usage Patterns

### Query Step Information
```typescript
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
```typescript
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
```typescript
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
```typescript
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
