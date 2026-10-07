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
  /**
   * Awaited BEFORE `isCompleted` is committed (it observes `isCompleted: false`).
   * A throw leaves `isCompleted: false` and rejects `submit()`/`goNext()`, so the
   * user can retry. A reset()/cancel()/restore() while it runs cancels the
   * completion (no `onComplete` event, no plugin `onComplete`).
   *
   * Once it resolves: `isCompleted: true` and the final step's "completed"
   * status are committed in one write → `onStateChange` → every plugin's
   * `onComplete` (invoked synchronously, registration order) →
   * `events.onComplete`. Plugins therefore see completion before app code can
   * tear the wizard down from `events.onComplete`.
   */
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
  /** WIZ-013: lazily loaded implementation (validate / onEnter / onLeave / onSubmit). */
  load?: StepLoader<T>;
}
```

### `StepLoader<T>` and `LazyStepImplementation<T>`

WIZ-013. The skeleton of a step (`id`, `next`, `previous`, `enabled`, `meta`) stays eager; only the four hooks below can be loaded lazily.

```ts
type LazyStepImplementation<T> = Pick<
  WizardStepDefinition<T>,
  "validate" | "onEnter" | "onLeave" | "onSubmit"
>;

type StepLoader<T> = () => Promise<
  LazyStepImplementation<T> | { default: LazyStepImplementation<T> }
>;
```

- The loader may resolve to the implementation or to a module namespace; an object `default` export wins over named exports.
- Every loaded hook must be a function — a non-function `validate` / `onEnter` / `onLeave` / `onSubmit` is a load error (`WizardStepLoadError`, `TypeError` cause).
- A hook defined on both the skeleton and the loaded implementation is **composed**, not replaced: `validate` becomes `combineValidators(skeleton, loaded)` (both must pass, errors merged); `onEnter` / `onLeave` / `onSubmit` run the skeleton's hook first, then the loaded one. A hook only one side defines is used as-is (a loaded key that is `undefined` keeps the skeleton's hook), so `.required("x").lazy(...)` keeps its required check. The merged definition does not keep `load`.
- A successful load is cached for the lifetime of the machine; a failed load is not cached and is retried by the next attempt.

See [Lazy Steps](../defining-wizards.md#lazy-steps) for when loads happen.

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
  isLoadingStep: boolean; // true while a lazy step's implementation loads (WIZ-013)
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
  enabledSteps: number; // steps not currently skipped (function guards refreshed at navigation time)
  completedSteps: number; // steps with status "completed"
  currentStepIndex: number; // 0-based index among enabled steps (-1 if current step is skipped)
  enabledStepIds: StepId[]; // ordered list of enabled step ids
  percentage: number; // 0–100, completedSteps / enabledSteps * 100, rounded (100 once completed)
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

  // Lazy steps (WIZ-013)
  /**
   * Starts (or joins) loading a lazy step's implementation without navigating.
   * Never sets isLoadingStep and never reports through onError — the caller owns
   * the returned promise (add `.catch(() => {})` for fire-and-forget; bindings'
   * `actions.preloadStep` already never rejects). Rejects with
   * WizardNavigationError (reason "not-found") for an unknown id and with
   * WizardStepLoadError when the load fails. Resolves immediately for a step
   * without `load` or one that is already loaded.
   *
   * When the loaded step is the CURRENT step, emits one onStateChange so bindings
   * pick up the new `currentStep` definition (skipped while a foreground load of
   * that step is in flight, and after destroy()).
   */
  preloadStep(stepId: StepId): Promise<void>;

  // Persistence
  serialize(): WizardSerializedState<T>;
  /** Like reset(), supersedes in-flight transitions and a pending initial-step onEnter. */
  restore(state: WizardSerializedState<T>): void;

  // Data operations
  /** An in-place updater that returns the same object is committed as a shallow copy (new reference). */
  updateData(updater: (data: T) => T): void;
  setData(data: T): void;
  /** Update one top-level field. Object.is no-op guard. Fires onDataChange with changedFields=[field]. (WIZ-010) */
  updateField<K extends keyof T>(field: K, value: T[K]): void;
  /** Subscribe to one field. Returns an unsubscribe function. (WIZ-010) */
  watchField<K extends keyof T>(field: K, callback: (newValue: T[K], oldValue: T[K]) => void): () => void;

  // Validation & submission
  /** A passing result also clears an "error" status on the current step. */
  validate(): Promise<ValidationResult>;
  // Validate ALL enabled steps without navigating (dry-run by default).
  validateAll(options?: { updateStatuses?: boolean }): Promise<ValidationSummary>;
  canSubmit(): Promise<boolean>;
  /** A validation failure marks the current step "error". */
  submit(): Promise<void>;

  // Navigation
  goNext(): Promise<void>;
  /**
   * History-first: goes to the nearest earlier history entry whose `enabled`
   * guard is true (throws reason "disabled" if none); falls back to the
   * `previous` transition only when history holds just the current step.
   */
  goPrevious(): Promise<void>;
  /** @deprecated Use goPrevious() instead */
  goBack(steps?: number): Promise<void>;
  /** A validation failure (unless skipValidation) marks the current step "error". */
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
  /** Exactly the step goPrevious() would navigate to (history-first, guard-aware); null if none. */
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
  /** Fired after every committed state change. Isolated: a throw is routed to onError (plugin phase "state") and never rejects the in-flight operation. */
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: StepId, data: T) => void;
  onStepLeave?: (stepId: StepId, data: T) => void;
  onValidation?: (result: ValidationResult) => void;
  onSubmit?: (stepId: StepId, data: T) => void;
  /**
   * Fired last on completion: after the committed `isCompleted` state change and
   * after every plugin's `onComplete` has been invoked, so destroying/unmounting
   * the wizard here is safe (analytics reports completion, not a drop-off).
   */
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

The manual round-trip above stays supported, but the **recommended path is
`createPersistencePlugin`** (see below): it restores on init, debounces auto-save, clears on
complete/reset and swallows corrupt snapshots instead of throwing at your call site.

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
- `.lazy(StepLoader&lt;T&gt;)` - Load `validate` / `onEnter` / `onLeave` / `onSubmit` on first use, e.g. `.lazy(() => import("./steps/documents"))` (WIZ-013)
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

### `WizardStepLoadError`

A lazy step's implementation failed to load (WIZ-013): the loader rejected or threw, or it resolved to something that is not a step implementation object (including a non-function `validate` / `onEnter` / `onLeave` / `onSubmit`). The original failure is the native `cause`, and its message is appended to this error's message: `Failed to load step "<id>": <cause message>` (just `Failed to load step "<id>"` without a cause). Navigation and `submit()` reject with it; `validate()` resolves `{ valid: false, errors: { general: "Failed to load step" } }`. Leaving a step whose own load fails is not blocked (only a failing target load blocks); see [Lazy Steps](../defining-wizards.md#lazy-steps).

```ts
class WizardStepLoadError extends WizardError {
  readonly stepId: StepId;
  cause?: unknown;

  constructor(stepId: StepId, options?: { cause?: unknown });
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

See the [Plugins guide](/guide/plugins) for full usage documentation.

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
  phase: "validation" | "transition" | "lifecycle" | "submit" | "data" | "state" | "load"; // "load": a lazy step failed to load (WIZ-013)
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
  /** True while a navigation/submit is in flight (WizardMachine.isBusy). */
  readonly isBusy?: boolean;
  /** JSON-safe snapshot of the runtime state (WizardMachine.serialize). */
  serialize?(): WizardSerializedState<TData>;
  /** Re-applies a serialized snapshot in place; throws WizardRestoreError when invalid. */
  restore?(state: WizardSerializedState<TData>): void;
}
```

`isBusy`, `serialize` and `restore` were added in WIZ-006 for `createPersistencePlugin`. They
are **optional** so facades written against the original three-member shape keep compiling —
the real `WizardMachine` facade always provides all three, but a plugin that needs them must
feature-detect and degrade gracefully.

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

### `createAnalyticsPlugin`

Built-in analytics collector. Auto-times each step, counts backtracks, records drop-off
on teardown, and fires optional callbacks. The returned instance adds a synchronous
`getReport()` method. Never vetoes. Timing uses `config.now` (default `Date.now`), not
`TransitionEvent.timestamp`, so durations are injectable in tests.

```ts
import { createAnalyticsPlugin } from "@gooonzick/wizard-core";
// or: import { createAnalyticsPlugin } from "@gooonzick/wizard-core/plugins";

function createAnalyticsPlugin<TData>(
  config?: AnalyticsPluginConfig<TData>,
): AnalyticsPlugin<TData>;

interface AnalyticsPluginConfig<TData> {
  onStepView?(stepId: StepId, data: DeepReadonly<TData>): void;
  onStepComplete?(stepId: StepId, durationMs: number): void;
  onWizardComplete?(data: DeepReadonly<TData>, totalDurationMs: number): void;
  /** Fired on destroy() only if the wizard was not completed. */
  onDropOff?(stepId: StepId, durationMs: number): void;
  onBacktrack?(fromStepId: StepId, toStepId: StepId): void;
  /** Injectable clock for testability. Defaults to Date.now. */
  now?: () => number;
}

type AnalyticsPlugin<TData> = WizardPlugin<TData> & {
  getReport(): AnalyticsReport;
};

interface AnalyticsReport {
  startedAt: number;
  stepTimings: Record<StepId, number>; // includes the current step's live open visit
  backtrackCount: number;
  backtrackHistory: BacktrackEntry[];
  currentStep: StepId | null;
  completed: boolean;
  totalDuration: number;
}

interface BacktrackEntry {
  from: StepId;
  to: StepId;
  at: number;
}
```

A step's timer closes on `afterTransition` (or in `onComplete` for the terminal step);
`getReport()` folds the current step's still-open visit into `stepTimings` and
`totalDuration`. A backtrack is any `previous` transition, or a `goTo` to a
previously-visited step. `onDropOff` fires from `destroy()` only when the wizard never
completed (checked against both the plugin's own `onComplete` bookkeeping and the
machine's `snapshot.isCompleted`). Resetting the wizard restarts the analytics session in place and does not
re-emit `onStepView`.

### `createPersistencePlugin`

Built-in state persistence (WIZ-006). Restores a stored snapshot in `onInit`, auto-saves
(debounced on data changes, immediately after committed transitions) and clears the record on
completion / reset. Never vetoes. `onInit` never throws and never returns a promise, so
persistence failures never reach the machine's error channel.

```ts
import { createPersistencePlugin } from "@gooonzick/wizard-core";
// or: import { createPersistencePlugin } from "@gooonzick/wizard-core/plugins";

function createPersistencePlugin<TData>(
  config: PersistencePluginConfig<TData>,
): PersistencePlugin<TData>;

interface PersistencePluginConfig<TData> {
  /** REQUIRED storage backend. */
  adapter: WizardPersistenceAdapter<TData>;
  name?: string; // default: "persistence"
  restoreOnInit?: boolean; // default: true
  debounceMs?: number; // default: 300; 0 = next microtask
  version?: number; // app-controlled schema version; default: 1
  maxAgeMs?: number; // default: undefined (never expire)
  saveOnTransition?: boolean; // default: true
  saveOnDataChange?: boolean; // default: true
  clearOnComplete?: boolean; // default: true
  clearOnReset?: boolean; // default: true
  flushOnUnload?: boolean; // default: false ("pagehide" listener)
  /** Redact/transform before writing. Return null to skip this write. */
  beforeSave?(state: WizardSerializedState<TData>): WizardSerializedState<TData> | null;
  onRestored?(state: WizardSerializedState<TData>): void;
  onRestoreSkipped?(reason: PersistenceSkipReason): void;
  onRestoreError?(error: Error, raw: unknown): void;
  onSaveError?(error: Error): void;
}

type PersistencePlugin<TData> = WizardPlugin<TData> & {
  /**
   * Outcome of the LATEST onInit's restore attempt. NEVER rejects. Re-armed by
   * an onInit whose predecessor already settled (StrictMode re-init, remount with
   * a hoisted plugin), so read it after the machine / use() call.
   */
  readonly ready: Promise<PersistenceRestoreOutcome<TData>>;
  /** Cancels the debounce and drains any pending write. */
  flush(): Promise<void>;
  /** Cancels the debounce, drops any pending save and clears the stored record. */
  clear(): Promise<void>;
};

type PersistenceRestoreOutcome<TData> =
  | { status: "restored"; state: WizardSerializedState<TData> }
  | { status: "skipped"; reason: PersistenceSkipReason }
  | { status: "failed"; error: Error };

type PersistenceSkipReason =
  | "disabled"
  | "unsupported"
  | "empty"
  | "version-mismatch"
  | "expired"
  | "completed"
  | "stale"
  | "destroyed";
```

With a synchronous adapter the snapshot is applied **inside** `onInit`, i.e. before
`use()` / the constructor returns. With an asynchronous adapter there is no ordering
guarantee: a late load is discarded (`"stale"` / `"destroyed"`) when the wizard has moved on,
is busy, or the plugin was destroyed or superseded — `await plugin.ready` to observe the
outcome. Corrupt, expired, version-mismatched and completed records are cleared rather than
applied.

### `WizardPersistenceAdapter`

Async-first storage contract: every method may return a value **or** a promise.

```ts
interface WizardPersistenceAdapter<TData> {
  load():
    | PersistedWizardSnapshot<TData>
    | null
    | Promise<PersistedWizardSnapshot<TData> | null>;
  save(snapshot: PersistedWizardSnapshot<TData>): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** JSON-safe envelope actually handed to / returned by an adapter. */
interface PersistedWizardSnapshot<TData> {
  envelope: 1; // library-owned envelope format
  version: number; // PersistencePluginConfig.version
  savedAt: number; // Date.now() at write time
  state: WizardSerializedState<TData>;
}
```

`load()` returns `null` when nothing is stored. A throw/rejection from any method is caught
by the plugin and reported through `onRestoreError` / `onSaveError`; writes are never retried.
The loaded value is treated as untrusted — the plugin validates the envelope and delegates
deep validation to `machine.restore()`.

### `localStorageAdapter` / `sessionStorageAdapter`

Built-in web-storage adapters. Storage is resolved lazily inside every call (and guarded with
try/catch), so the module is SSR-safe and has no import-time side effects. When storage is
unavailable `load()` returns `null` and `save()` / `clear()` are silent no-ops.

```ts
import {
  localStorageAdapter,
  sessionStorageAdapter,
} from "@gooonzick/wizard-core";

function localStorageAdapter<TData>(
  key: string,
  options?: WebStorageAdapterOptions,
): WizardPersistenceAdapter<TData>;

function sessionStorageAdapter<TData>(
  key: string,
  options?: WebStorageAdapterOptions,
): WizardPersistenceAdapter<TData>;

interface WebStorageAdapterOptions {
  /** Explicit storage; when omitted the matching global is resolved lazily. */
  storage?: StorageLike;
}

/** Minimal structural subset of the Web Storage API (injectable for tests/SSR). */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
```

`load()` throws `WizardRestoreError` when the stored string is not valid JSON; `save()`
propagates a `setItem` failure (e.g. quota) so the plugin can report it via `onSaveError`.
Namespace the key per wizard — ``localStorageAdapter(`wizard:${definition.id}`)`` — because
two wizards sharing a key destroy each other's progress. Persisted data must be JSON-safe.
