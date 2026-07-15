
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
  /** Invoked by `cancel()` before the machine is reset. */
  onCancel?: CompleteHandler<T>;
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
  onCancel: async (data, ctx) => {
    /* cleanup drafts, analytics, etc. */
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
  meta: { title: "Personal Info" },
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
  canGoBack: boolean; // true when history stack has > 1 entry
  validationErrors?: Record<string, string>;
  stepStatuses: Record<StepId, StepStatus>; // Status of every step
  progress: WizardProgress; // Computed progress snapshot
}
```

### WizardSerializedState

Plain JSON-safe runtime state returned by `machine.serialize()` and accepted by
`machine.restore(state)`.

```ts
interface WizardSerializedState<T> {
  version: 1;
  currentStepId: StepId;
  data: T;
  isValid: boolean;
  isCompleted: boolean;
  validationErrors?: Record<string, string>;
  stepStatuses: Record<StepId, StepStatus>;
  visitedSteps: StepId[];
  history: StepId[];
}
```

`progress` is not stored because it is derived from `stepStatuses` and the
current wizard definition.

### WizardProgress

Derived progress information, recomputed on every `onStateChange`.

```ts
interface WizardProgress {
  totalSteps: number; // all steps in the definition
  enabledSteps: number; // steps not currently skipped
  completedSteps: number; // steps with status "completed"
  currentStepIndex: number; // 0-based index among enabled steps (-1 if current step is skipped)
  enabledStepIds: StepId[]; // ordered list of enabled step ids
  percentage: number; // 0–100, completedSteps / enabledSteps * 100, rounded
  isFirstStep: boolean; // currentStepId === definition.initialStepId
  isLastStep: boolean; // no resolvable next step (navigation-graph based)
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

### `ValidationSummary`

Aggregate result of validating every enabled step (returned by `validateAll`).

```ts
interface ValidationSummary {
  valid: boolean;                    // true iff all validated steps are valid
  steps: StepValidationSummary[];    // one entry per validated (enabled) step
  firstInvalidStepId: StepId | null; // first invalid step in definition order
  invalidStepIds: StepId[];          // all invalid step ids, in definition order
}
```

### `StepValidationSummary`

Per-step entry inside a `ValidationSummary`.

```ts
interface StepValidationSummary {
  stepId: StepId;
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

  // Persistence
  serialize(): WizardSerializedState<T>;
  restore(state: WizardSerializedState<T>): void;

  // Data operations
  updateData(updater: (data: T) => T): void;
  setData(data: T): void;
  /** Update one top-level field. Object.is no-op guard. Fires onDataChange with changedFields=[field]. (WIZ-010) */
  updateField<K extends keyof T>(field: K, value: T[K]): void;
  /** Subscribe to one field. Returns an unsubscribe function. (WIZ-010) */
  watchField<K extends keyof T>(field: K, callback: (newValue: T[K], oldValue: T[K]) => void): () => void;

  // Validation & submission
  validate(): Promise<ValidationResult>;
  // Validate ALL enabled steps without navigating (dry-run by default).
  validateAll(options?: { updateStatuses?: boolean }): Promise<ValidationSummary>;
  canSubmit(): Promise<boolean>;
  submit(): Promise<void>;

  // Navigation
  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  /** @deprecated Use goPrevious() instead */
  goBack(steps?: number): Promise<void>;
  goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
  /** @deprecated Use goTo(stepId) instead */
  goToStep(stepId: StepId): Promise<void>;
  clearHistory(): void;

  // Reset / Cancel
  reset(data?: T): void;
  cancel(): Promise<void>;

  // Step Status
  getStepStatus(stepId: StepId): StepStatus;
  setStepStatus(stepId: StepId, status: StepStatus): void;

  // Query
  getNextStepId(): Promise<StepId | null>;
  getPreviousStepId(): Promise<StepId | null>;
  canNavigateToStep(stepId: StepId): Promise<boolean>;
  getAvailableSteps(): Promise<StepId[]>; // Note: async

  // Plugin registration (WIZ-007)
  /** Chainable. Throws WizardConfigurationError on duplicate name. */
  use(plugin: WizardPlugin<T>): this;
  /** Runs the plugin's destroy(), then removes it. No-op if absent. */
  removePlugin(name: string): Promise<void>;
  /** Runs every plugin's destroy() in reverse registration order. */
  destroy(): Promise<void>;
}
```

### Constructor

```ts
constructor(
  definition: WizardDefinition<T>,
  context: WizardContext = {},
  initialData: T,
  events?: WizardEvents<T>,
  plugins?: WizardPlugin<T>[]
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
  /** Fired by `cancel()` before the machine is reset. May be async. */
  onCancel?: (data: T) => void | Promise<void>;
  /** Fired after `reset()` (and after `cancel()`'s implicit reset). */
  onReset?: () => void;
  onError?: (error: Error) => void;
  /**
   * Fired after a data mutation (updateField/updateData/setData) that changes
   * at least one top-level field. Fires after onStateChange; NOT fired on
   * reset(), restore(), or navigation. changedFields are the changed top-level
   * keys (Object.is). (WIZ-010)
   */
  onDataChange?: (
    prevData: T,
    nextData: T,
    changedFields: (keyof T)[],
  ) => void;
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

### Persist and Restore State

```ts
const machine = new WizardMachine(definition, context, initialData);

localStorage.setItem("checkout-wizard", JSON.stringify(machine.serialize()));

const savedState = localStorage.getItem("checkout-wizard");
if (savedState) {
  machine.restore(JSON.parse(savedState));
}
```

`restore()` validates that serialized step IDs still exist in the wizard
definition. It emits one `onStateChange` event and does not replay step
lifecycle hooks.

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
  stepId?: StepId;
  reason?: "disabled" | "not-found" | "busy" | "circular";

  constructor(
    message: string,
    stepId?: StepId,
    reason?: "disabled" | "not-found" | "busy" | "circular",
  );
}
```

### `WizardConfigurationError`

Invalid configuration.

```ts
class WizardConfigurationError extends WizardError {
  constructor(message: string);
}
```

### `WizardRestoreError`

Thrown by `restore()` when the serialized state is malformed or incompatible
with the current wizard definition (unknown step IDs, bad version, etc.).

```ts
class WizardRestoreError extends WizardError {
  constructor(message: string);
}
```

### `WizardAbortError`

Operation aborted via signal.

```ts
class WizardAbortError extends WizardError {
  constructor(message?: string);
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

// Update one field (no-op if the value is Object.is-equal to the current value)
machine.updateField("name", "John");

// React to data changes (fires after onStateChange; not on reset/restore/navigation)
const stop = machine.watchField("name", (next, prev) => {
  console.log(`name: ${prev} → ${next}`);
});
stop(); // unsubscribe

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

// Jump to specific step (validates current step by default)
await machine.goTo("step-id");

// Skip validation when jumping
await machine.goTo("step-id", { skipValidation: true });

// Skip guards and validation
await machine.goTo("step-id", { skipValidation: true, skipGuards: true });
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

---

## Plugin Types (WIZ-007)

See the [Plugins guide](../plugins.md) for full usage documentation.

### `WizardPlugin<TData>`

```ts
interface WizardPlugin<TData = unknown> {
  name: string;
  onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;
  /** Return `false` to veto the transition (silent cancel). */
  beforeTransition?(
    e: TransitionEvent<TData>,
  ): boolean | undefined | Promise<boolean | undefined>;
  afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;
  onError?(
    error: WizardError | Error,
    ctx: ErrorContext<TData>,
  ): void | Promise<void>;
  onComplete?(data: DeepReadonly<TData>): void | Promise<void>;
  onReset?(): void | Promise<void>;
  /** Fired after a data mutation that changed ≥1 top-level field. Fire-and-forget; DeepReadonly payloads; errors routed to onError phase "data". (WIZ-010) */
  onDataChange?(
    prevData: DeepReadonly<TData>,
    nextData: DeepReadonly<TData>,
    changedFields: readonly (keyof TData)[],
  ): void | Promise<void>;
  destroy?(): void | Promise<void>;
}
```

### `TransitionEvent<TData>`

Payload passed to `beforeTransition` and `afterTransition`.

```ts
interface TransitionEvent<TData> {
  type: "next" | "previous" | "goTo";
  fromStepId: StepId;
  toStepId: StepId;
  data: DeepReadonly<TData>;
  timestamp: number;
}
```

### `ErrorContext<TData>`

Context passed to `onError`.

```ts
interface ErrorContext<TData> {
  stepId: StepId;
  phase: "validation" | "transition" | "lifecycle" | "submit" | "data";
  data: DeepReadonly<TData>;
}
```

### `WizardMachineReadonly<TData>`

Read-only view passed to `onInit`.

```ts
interface WizardMachineReadonly<TData> {
  readonly snapshot: DeepReadonly<WizardState<TData>>;
  readonly currentStep: DeepReadonly<WizardStepDefinition<TData>>;
  getStepStatus(stepId: StepId): StepStatus;
}
```

### `DeepReadonly<T>`

Compile-time recursive readonly mapped type applied to all plugin hook payloads. Zero runtime cost — payloads are not cloned. Functions are left untouched.

```ts
type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;
```

### `createLoggingPlugin`

Reference plugin that logs every hook. Never vetoes, never throws.

```ts
import { createLoggingPlugin } from "@gooonzick/wizard-core";
// or: import { createLoggingPlugin } from "@gooonzick/wizard-core/plugins";

function createLoggingPlugin<TData>(config?: {
  level?: "debug" | "info" | "warn"; // default: "debug"
  logger?: Pick<Console, "log" | "warn" | "debug">; // default: console
}): WizardPlugin<TData>;
```
