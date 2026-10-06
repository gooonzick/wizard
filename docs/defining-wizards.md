
# Defining Wizards

This guide covers the different ways to define wizards and when to use each approach.

## Overview

You can define wizards in three ways:

1. **Declarative** - Write the `WizardDefinition` object directly
2. **Builder Pattern** - Use fluent API with `createWizard()`
3. **Linear Helper** - Use `createLinearWizard()` for simple linear flows

## 1. Declarative Definition

Write the raw `WizardDefinition` object directly. Use this for:

- Complex wizards with lots of conditional logic
- When you want to serialize/deserialize the definition (e.g., from a server)
- When you need the clearest representation of wizard structure

```typescript
import type { WizardDefinition } from "@gooonzick/wizard-core";

type CheckoutData = {
  email: string;
  needsInvoice: boolean;
  invoiceCompany?: string;
  cardNumber: string;
};

const checkoutWizard: WizardDefinition<CheckoutData> = {
  id: "checkout",
  initialStepId: "email",

  steps: {
    email: {
      id: "email",
      meta: {
        title: "Email Address",
        description: "We'll send your receipt here",
      },
      validate: (data) => ({
        valid: data.email?.includes("@") ?? false,
        errors: data.email?.includes("@")
          ? undefined
          : { email: "Invalid email address" },
      }),
      next: { type: "static", to: "payment" },
    },

    payment: {
      id: "payment",
      meta: {
        title: "Payment",
        description: "Enter your card details",
      },
      validate: (data) => ({
        valid: data.cardNumber?.length === 16 ?? false,
        errors:
          data.cardNumber?.length === 16
            ? undefined
            : { cardNumber: "Card number must be 16 digits" },
      }),
      previous: { type: "static", to: "email" },
      next: {
        type: "conditional",
        branches: [
          { when: (d) => d.needsInvoice, to: "invoice" },
          { when: () => true, to: "summary" },
        ],
      },
    },

    invoice: {
      id: "invoice",
      meta: {
        title: "Invoice Details",
        description: "Company information for your invoice",
      },
      enabled: (data) => data.needsInvoice,
      validate: (data) => ({
        valid: Boolean(data.invoiceCompany),
        errors: data.invoiceCompany
          ? undefined
          : { invoiceCompany: "Company name is required" },
      }),
      previous: { type: "static", to: "payment" },
      next: { type: "static", to: "summary" },
    },

    summary: {
      id: "summary",
      meta: {
        title: "Order Summary",
        description: "Review your order",
      },
      onSubmit: async (data, ctx) => {
        const response = await (ctx as any).api.processPayment(data);
        if (!response.success) {
          throw new Error("Payment failed");
        }
      },
    },
  },

  onComplete: async (data, ctx) => {
    console.log("Order completed:", data);
    await (ctx as any).router.navigate("/order-confirmation");
  },
};
```

## 2. Builder Pattern

Use `createWizard()` for a fluent, chainable API. Use this for:

- Building wizards programmatically
- When you prefer method chaining
- Most everyday use cases

```typescript
import { createWizard, requiredFields } from "@gooonzick/wizard-core";

type CheckoutData = {
  email: string;
  needsInvoice: boolean;
  invoiceCompany?: string;
  cardNumber: string;
};

const checkoutWizard = createWizard<CheckoutData>("checkout")
  .initialStep("email")

  // First step: email
  .step("email", (step) =>
    step
      .title("Email Address")
      .description("We'll send your receipt here")
      .validate((data) => ({
        valid: data.email?.includes("@") ?? false,
        errors: data.email?.includes("@")
          ? undefined
          : { email: "Invalid email address" },
      }))
      .next("payment"),
  )

  // Second step: payment
  .step("payment", (step) =>
    step
      .title("Payment")
      .description("Enter your card details")
      .previous("email")
      .validate((data) => ({
        valid: data.cardNumber?.length === 16 ?? false,
        errors:
          data.cardNumber?.length === 16
            ? undefined
            : { cardNumber: "Card number must be 16 digits" },
      }))
      .nextWhen([
        { when: (d) => d.needsInvoice, to: "invoice" },
        { when: () => true, to: "summary" },
      ]),
  )

  // Optional step: invoice (conditionally shown)
  .step("invoice", (step) =>
    step
      .title("Invoice Details")
      .description("Company information for your invoice")
      .enabled((data) => data.needsInvoice)
      .required("invoiceCompany")
      .previous("payment")
      .next("summary"),
  )

  // Final step: summary
  .step("summary", (step) =>
    step
      .title("Order Summary")
      .description("Review your order")
      .onSubmit(async (data, ctx) => {
        const response = await (ctx as any).api.processPayment(data);
        if (!response.success) {
          throw new Error("Payment failed");
        }
      }),
  )

  .onComplete(async (data, ctx) => {
    console.log("Order completed:", data);
    await (ctx as any).router.navigate("/order-confirmation");
  })

  .build();
```

### Builder Method Reference

#### Step Configuration

```typescript
.step("step-id", (step) =>
  step
    // Metadata
    .title("Step Title")
    .description("Step description")
    .icon("checkout") // Custom metadata

    // Navigation
    .previous("prev-step-id")
    .next("next-step-id")
    .nextWhen([
      { when: (d) => d.isPremium, to: "premium-path" },
      { when: () => true, to: "standard-path" },
    ])
    .nextResolver(async (data, ctx) => {
      const path = await api.determinePath(data);
      return path;
    })

    // Validation
    .validate(customValidator)
    .required("field1", "field2")
    .validateWithSchema(mySchema)

    // Lifecycle
    .onEnter(async (data, ctx) => { /* ... */ })
    .onLeave(async (data, ctx) => { /* ... */ })
    .onSubmit(async (data, ctx) => { /* ... */ })

    // Availability
    .enabled(true) // or (data) => boolean

    // Lazy implementation (validate / onEnter / onLeave / onSubmit)
    .lazy(() => import("./steps/documents"))
)
```

## 3. Linear Wizard Helper

Use `createLinearWizard()` for simple step-by-step flows with no branching. Use this for:

- Simple questionnaires
- Linear registration flows
- Forms that go straight through with no conditional logic

```typescript
import { createLinearWizard } from "@gooonzick/wizard-core";

type SignupData = {
  name: string;
  email: string;
  password: string;
};

const signupWizard = createLinearWizard<SignupData>({
  id: "signup",
  steps: [
    {
      id: "personal",
      title: "Personal Info",
      description: "What should we call you?",
      validate: (data) => ({
        valid: Boolean(data.name),
        errors: data.name ? undefined : { name: "Name is required" },
      }),
    },
    {
      id: "contact",
      title: "Contact Info",
      description: "How can we reach you?",
      validate: (data) => ({
        valid: Boolean(data.email),
        errors: data.email ? undefined : { email: "Email is required" },
      }),
    },
    {
      id: "security",
      title: "Security",
      description: "Create a secure password",
      validate: (data) => ({
        valid: (data.password?.length ?? 0) >= 8,
        errors:
          (data.password?.length ?? 0) >= 8
            ? undefined
            : { password: "Password must be at least 8 characters" },
      }),
      onSubmit: async (data, ctx) => {
        await (ctx as any).api.createAccount(data);
      },
    },
  ],
  onComplete: async (data) => {
    console.log("Signup complete:", data);
  },
});
```

## Comparison: Which Approach?

| Use Case                     | Approach               | Reason                                                      |
| ---------------------------- | ---------------------- | ----------------------------------------------------------- |
| Simple 2-3 step flow         | Linear Helper          | Less boilerplate, clear intent                              |
| Standard multi-step form     | Builder Pattern        | Good balance of clarity and control                         |
| Server-side definition       | Declarative            | Can be serialized and sent from API                         |
| Complex branching logic      | Declarative or Builder | Both work, but declarative may be clearer for complex logic |
| Building wizards dynamically | Builder or Declarative | Both support programmatic construction                      |

## Advanced Patterns

### Combining Validators

```typescript
import {
  combineValidators,
  requiredFields,
  createValidator,
} from "@gooonzick/wizard-core";

const emailValidator = createValidator(
  (data) => data.email?.includes("@"),
  "Invalid email format",
  "email",
);

const ageValidator = createValidator(
  (data) => (data.age ?? 0) >= 18,
  "Must be 18 or older",
  "age",
);

const step = (s) =>
  s
    .title("Account Setup")
    .validate(
      combineValidators(
        requiredFields("email", "age"),
        emailValidator,
        ageValidator,
      ),
    );
```

### Using Schema Validation

```typescript
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";
import * as v from "valibot"; // or any Standard Schema library

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(18)),
  name: v.string(),
});

const step = (s) => s.title("Account Setup").validateWithSchema(schema);
```

### Conditional Step Availability

```typescript
.step("enterprise-setup", (s) =>
  s
    .title("Enterprise Configuration")
    .enabled((data) => data.plan === "enterprise")
)
```

### Dynamic Navigation

```typescript
.step("route-decision", (s) =>
  s
    .title("Loading...")
    .nextResolver(async (data, ctx) => {
      // Ask your API which path to take
      const segment = await (ctx as any).api.determinePath(data.userId);
      return segment.nextStep;
    })
)
```

### Lazy Steps

Large wizards can defer a step's heavy implementation — validation schemas, lifecycle code — until the step is actually used. The step **skeleton** (`id`, `next`, `previous`, `enabled`, `meta`) stays in the definition, so progress, `isLastStep` and disabled-step skipping never wait for a download. Only `validate`, `onEnter`, `onLeave` and `onSubmit` are loaded lazily.

```typescript
// steps/documents.ts — becomes its own chunk
import type { LazyStepImplementation } from "@gooonzick/wizard-core";

export default {
  validate: createStandardSchemaValidator(heavyDocumentsSchema),
  onEnter: async (data, ctx) => { /* … */ },
} satisfies LazyStepImplementation<Application>;

// wizard.ts
createWizard<Application>("loan")
  .step("documents", (s) =>
    s
      .title("Documents")
      .previous("personal")
      .next("summary")
      .lazy(() => import("./steps/documents")),
  );
```

Declaratively, set `load: () => import("./steps/documents")` on the step definition. The loader may resolve to the implementation object or to a module namespace with a `default` export (an object `default` export wins over named exports). A hook defined on both the skeleton and the loaded implementation is **composed**, never replaced: `validate` becomes `combineValidators(skeleton, loaded)` (both must pass, their errors are merged) and `onEnter` / `onLeave` / `onSubmit` run the skeleton's hook first, then the loaded one. A hook only one side defines is used as-is, and a loaded key that is `undefined` keeps the skeleton's hook. So a builder's `.required(...)` keeps protecting the step after its implementation loads:

```typescript
.step("documents", (s) =>
  s
    .required("passport") // skeleton validate — still enforced after the load
    .lazy(() => import("./steps/documents")), // its validate runs in addition
)
```

Every loaded hook must be a function — a non-function `validate`, `onEnter`, `onLeave` or `onSubmit` is a load error. The merged step definition does not keep `load`.

**When it loads.** The first time the implementation is needed: navigating into or out of the step (before `beforeTransition`, `onLeave` and any state change; a never-entered initial step is not loaded when left — see **Initial lazy step** below), validating or submitting it, or entering it as the initial step. `validateAll()` loads every enabled lazy step. A successful load is cached for the lifetime of the machine (it survives `reset()`); `goTo(id, { skipLifecycle: true })` does not load the target step; the current step is still loaded for validation unless `skipValidation` is also set.

**Loading state.** `snapshot.isLoadingStep` (and `isLoadingStep` in every binding's loading slice) is `true` while the current or target step loads in the foreground (navigation, `submit()`, the initial step) — show a spinner with it. Background loads (`preloadStep()`, `validateAll()`, `canSubmit()`) never set it. If the user moves to another step (for example with `goTo(id, { skipLifecycle: true })`) while the load for the step they left is still pending, that load's result is dropped, and `isLoadingStep` can stay `true` until the abandoned load settles. After `destroy()` no loading flag flips and a navigation that still needs a load is a silent no-op (loaders may still run after `destroy()`; navigation into already-loaded or eager steps behaves as before).

**Prefetching.** `machine.preloadStep("documents")` starts the load without navigating — e.g. on hover of "Next". It does not set `isLoadingStep`, is not reported through `onError`, and **rejects** with `WizardStepLoadError` when the load fails (or `WizardNavigationError` for an unknown step id), so a fire-and-forget call on the machine must handle the rejection. In a binding, `actions.preloadStep(id)` is meant for exactly that use and **never rejects**: failures are swallowed there and reported by the navigation that needs the step.

```typescript
machine.preloadStep("documents").catch(() => {}); // core: you own the rejection
actions.preloadStep("documents"); // bindings: safe to fire and forget
```

When a background load (`preloadStep()` or `validateAll()`) replaces the definition of the **current** step, the machine emits one `onStateChange` so bindings pick up the loaded `currentStep` (`validateAll()` emits at most once in total). `canSubmit()` also loads a lazy current step in the background — no `isLoadingStep`, no `onError`; a failed load resolves `false`.

**Errors.** A failed load rejects the navigation / `submit()` with `WizardStepLoadError` (`stepId`, original error as the native `cause`). Its message contains the cause: `Failed to load step "<id>": <cause message>` (just `Failed to load step "<id>"` when there is no cause), so showing `error.message` is enough. The failure is reported once through `onError` and plugin `onError` with `phase: "load"` — even when several operations await the same failed attempt. When the **target** step fails to load in `goNext()`, the wizard stays on the current step; the current step's `onSubmit` (and `events.onSubmit`) have already run, so a retry runs them again — the same as with a throwing `beforeTransition`; design `onSubmit` to be idempotent. Failed loads are not cached — the next attempt is a new attempt, retries the loader and is reported again.

**Leaving a step whose chunk failed.** Navigation loads the target as required and the current step as best-effort (for its `onLeave`): if the current step's own load fails, the failure is reported once with `phase: "load"`, the skeleton's `onLeave` runs and the navigation continues — a broken chunk never traps the user on its step. Only a failing *target* load blocks. `goNext()`, `goTo()` with validation and `submit()` still need the current step loaded before they validate it, so they reject with `WizardStepLoadError` until it loads.

**Initial lazy step.** If the initial step's load fails, its `onEnter` and `events.onStepEnter` have not run — the step has not been entered. They run once, the next time the step is used — validated by `validate()`, `canSubmit()`, or the validation in `goNext()`, `goTo()` and `submit()` — while it is still the current step. Lifecycle hooks of a step run only if the step was entered, so leaving it without validation (`goPrevious()`, `goTo(id, { skipValidation: true })`) does not load it and skips its `onLeave` and `events.onStepLeave` (a skeleton `onLeave` on that step does not run either); `beforeTransition` / `afterTransition`, history and statuses behave as usual. Coming back to it later loads it as the target and enters it normally. `reset()`, `cancel()` and `restore()` discard the pending entry.

**Validation.** `validate()` on an unloaded lazy step resolves `{ valid: false, errors: { general: "Failed to load step" } }` when the load fails; `validateAll()` marks the step invalid with `errors._error`. If the user moves to another step while `validate()` is waiting for the load, the step they left is neither validated nor reported — `validate()` validates the **new** current step instead. A `validate()` superseded by `reset()` / `cancel()` / `restore()` resolves `{ valid: false, errors: { general: "Validation error occurred" } }`. The `AbortSignal` is checked only when `validate()` is called: aborting while it waits for the load does not reject it.

### Using Context in Validation

```typescript
.step("license-check", (s) =>
  s
    .title("License Verification")
    .validate(async (data, ctx) => {
      const api = (ctx as any).api;
      const isValid = await api.verifyLicense(data.licenseKey);
      return {
        valid: isValid,
        errors: isValid ? undefined : { license: "Invalid license key" },
      };
    })
)
```

### Lifecycle with Context

```typescript
.step("profile", (s) =>
  s
    .title("Your Profile")
    .onEnter(async (data, ctx) => {
      // Load user profile from API
      const profile = await (ctx as any).api.getProfile();
      // Note: You'd need to handle updating the data
    })
    .onLeave(async (data, ctx) => {
      // Auto-save progress
      await (ctx as any).api.saveProgress(data);
    })
)
```

## Converting Between Approaches

If you start with one approach and need another:

### Linear → Builder

```typescript
// From linear...
const linear = createLinearWizard({ ... });

// To builder...
const builder = createWizard("same-id")
  .initialStep(linear.steps[0].id)
  .step(linear.steps[0].id, (s) => { /* ... */ })
  // ... add each step
  .build();
```

### Builder → Declarative

The builder returns a `WizardDefinition`, so you can inspect it:

```typescript
const built = createWizard("id")
  .step("step1", (s) => s.next("step2"))
  .build();

// built is a WizardDefinition<T>, can be saved/serialized
const definition: WizardDefinition<MyData> = built;
```

## Best Practices

1. **Keep validators focused** - Each validator should validate one concern
2. **Use required fields helper** - Don't manually check for empty strings
3. **Combine complex validators** - Use `combineValidators` instead of one mega-validator
4. **Use schema validation for complex types** - Libraries like Valibot are powerful
5. **Name your steps clearly** - Use step IDs that describe purpose (not "step1", "step2")
6. **Keep metadata in meta** - Don't put display logic in the data type
7. **Use guards for conditional steps** - Makes intent clear: "this step shows if X"
8. **Store context in one place** - Create it once, pass it everywhere
9. **Test validators independently** - They're pure functions, easy to unit test
10. **Use TypeScript generics** - Let TypeScript catch data shape mismatches
