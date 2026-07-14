
# Core Concepts

Understanding these fundamental concepts will help you build effective wizards with WizardForm.

## 1. State Machine Architecture

WizardForm is built on **finite state machine** principles. This means:

- Your wizard has a well-defined set of states (steps)
- It starts in a known initial state
- It only moves between states in defined ways
- It emits predictable events as it changes state

This architecture makes wizard behavior predictable and testable.

```typescript
// The WizardMachine is the heart of the framework
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    // Fired whenever the machine changes state
    console.log("Current step:", state.currentStepId);
  },
});

// Access state via getters (not methods)
console.log(machine.snapshot); // Get current state
console.log(machine.currentStep); // Get current step definition
console.log(machine.visited); // Get visited steps
console.log(machine.history); // Get navigation history
```

## 2. Wizard Definition

A `WizardDefinition` is a **declarative data structure** that describes your entire wizard:

```typescript
interface WizardDefinition<T> {
  id: string; // Unique identifier
  initialStepId: string; // Starting step
  steps: Record<string, WizardStepDefinition<T>>; // All steps
  onComplete?: (data: T) => void; // Called when finished
}
```

The definition is just **data**, not imperative code. This means:

- It's serializable (can be sent from a server)
- It's easy to test
- UI frameworks don't get coupled to it

## 3. Steps

Each step in a wizard is defined by a `WizardStepDefinition`. A step can have:

- **Validation**: Rules that must pass before moving forward
- **Transitions**: Instructions on where to go next or come from
- **Lifecycle hooks**: onEnter, onLeave, onSubmit
- **Guards**: Conditions that determine if the step is available
- **Metadata**: Title, description, icons, etc.

```typescript
const personalInfoStep: WizardStepDefinition<SignupData> = {
  id: "personal",
  title: "Personal Information",

  // Validation: must pass before going to next step
  validate: (data) => ({
    valid: Boolean(data.name && data.email),
    errors: {
      name: !data.name ? "Required" : undefined,
      email: !data.email ? "Required" : undefined,
    },
  }),

  // Navigation: where to go next
  next: { type: "static", to: "plan-selection" },

  // Lifecycle: called when entering this step
  onEnter: async (data, ctx) => {
    await ctx.analytics?.track("entered_personal_step");
  },

  // Can this step be accessed?
  enabled: true,
};
```

## 4. Transitions

A transition tells the wizard **how to navigate** between steps. There are three types:

### Static Transition

Always go to the same next step:

```typescript
next: { type: "static", to: "billing-info" }
```

Use when: There's only one logical next step.

### Conditional Transition

Branch based on data:

```typescript
next: {
  type: "conditional",
  branches: [
    { when: (data) => data.plan === "premium", to: "premium-setup" },
    { when: (data) => data.plan === "basic", to: "basic-setup" },
    { when: () => true, to: "default-setup" }, // fallback
  ],
}
```

Use when: The next step depends on user choices or data state.

### Resolver Transition

Dynamically resolve using async logic:

```typescript
next: {
  type: "resolver",
  resolve: async (data, ctx) => {
    // Ask your API which step to show next
    const userType = await ctx.api.getUserType(data.email);
    return userType === "premium" ? "premium-setup" : "basic-setup";
  },
}
```

Use when: You need to make an async call to determine the next step.

## 5. Validation

Validation ensures data is correct before moving forward. Every step can have a validator:

```typescript
interface Validator<T> {
  (data: T, ctx: WizardContext): SyncOrAsync<ValidationResult>;
}

interface ValidationResult {
  valid: boolean;
  errors?: Record<string, string>; // Field name -> error message
}
```

### Simple Field Validation

```typescript
validate: (data) => ({
  valid: data.email?.includes("@"),
  errors: !data.email?.includes("@") ? { email: "Invalid email" } : undefined,
});
```

### Using Validator Utilities

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

const step = {
  validate: combineValidators(requiredFields("email", "name"), emailValidator),
};
```

### Schema Validation

Use validators from Valibot, ArkType, or any Standard Schema implementation:

```typescript
import { createStandardSchemaValidator } from "@gooonzick/wizard-core";

const step = {
  validate: createStandardSchemaValidator(myValibotSchema),
};
```

### Async Validation

```typescript
validate: async (data, ctx) => {
  const isAvailable = await ctx.api.checkEmailAvailable(data.email);
  return {
    valid: isAvailable,
    errors: isAvailable ? undefined : { email: "Email already taken" },
  };
};
```

### Validating All Steps

`validate()` only checks the current step. To check every enabled step at once —
useful on a final "Review/Summary" step — call `validateAll()`. It runs each
enabled step's validator, skips disabled steps and steps without a validator
(treated as valid), and returns a `ValidationSummary` without mutating live
validation state (it is a dry-run by default):

```ts
const summary = await machine.validateAll();
// summary.valid, summary.invalidStepIds, summary.firstInvalidStepId, summary.steps

// Optionally mark invalid steps with the "error" status:
await machine.validateAll({ updateStatuses: true });
```

In React/Vue, `validateAll` lives on the `actions` slice:

```ts
const { actions, navigation } = useWizard({ ... });
const summary = await actions.validateAll();
if (!summary.valid) {
  navigation.goTo(summary.firstInvalidStepId!, { skipValidation: true });
}
```

## 6. Guards

Guards control **whether a step is accessible**. Use them for conditional logic about step availability:

```typescript
const invoiceStep: WizardStepDefinition<SignupData> = {
  id: "invoice",
  // Only show this step if user selected it
  enabled: (data) => data.needsInvoice === true,
};
```

Guards can be:

- **Boolean**: `enabled: true`
- **Predicate**: `enabled: (data) => data.isDeveloper`
- **Async**: `enabled: async (data, ctx) => await ctx.api.checkAccess()`

### Guard Combinators

Combine multiple guards:

```typescript
import { andGuards, orGuards, notGuard } from "@gooonzick/wizard-core";

const isPremium = (data) => data.plan === "premium";
const hasInvoice = (data) => data.needsInvoice;

// Show step if premium AND needs invoice
enabled: andGuards(isPremium, hasInvoice);

// Show step if premium OR enterprise
enabled: orGuards(isPremium, (data) => data.plan === "enterprise");

// Show step if NOT in test mode
enabled: notGuard((data) => data.testMode);
```

## 7. Lifecycle Hooks

Steps can execute code at key moments:

### onEnter

Called when the step becomes active:

```typescript
onEnter: async (data, ctx) => {
  // Load data from API
  const defaultValues = await ctx.api.getDefaults();
  // Track analytics
  ctx.logger?.log(`Entered step ${data.step}`);
};
```

### onLeave

Called before leaving the step:

```typescript
onLeave: async (data, ctx) => {
  // Auto-save progress
  await ctx.api.saveProgress(data);
};
```

### onSubmit

Called when the step is submitted:

```typescript
onSubmit: async (data, ctx) => {
  // Send data to server
  await ctx.api.submitStep(data);
};
```

**Important**: Lifecycle order is: **onEnter → validation/submission → onLeave**

## 8. Context

`WizardContext` is how you pass utilities to validators and hooks:

```typescript
interface WizardContext {
  debug?: boolean;
  signal?: AbortSignal; // For cancellation
  [key: string]: unknown; // Extend with your own
}
```

### Creating a Custom Context

```typescript
interface MyContext extends WizardContext {
  api: ApiClient;
  logger: Logger;
  router: Router;
}

const ctx: MyContext = {
  api: new ApiClient(),
  logger: console,
  router: myRouter,
};

// Use with WizardMachine
const machine = new WizardMachine(definition, ctx, initialData, events);

// Or with useWizard hook
useWizard({
  definition,
  initialData,
  context: ctx,
});
```

### Using Context in Validators

```typescript
validate: async (data, ctx) => {
  // Access custom context
  const myCtx = ctx as MyContext;
  const isValid = await myCtx.api.validate(data);
  return { valid: isValid };
};
```

## 9. Events and State

The wizard emits events as it processes:

```typescript
interface WizardEvents<T> {
  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: string, data: T) => void;
  onStepLeave?: (stepId: string, data: T) => void;
  onValidation?: (result: ValidationResult) => void;
  onSubmit?: (stepId: string, data: T) => void;
  onComplete?: (data: T) => void;
  onError?: (error: Error) => void;
}
```

Subscribe to these when creating the machine:

```typescript
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    // React state, Vue reactivity, etc.
    updateUI(state);
  },
  onError: (error) => {
    // Handle errors
    showErrorMessage(error.message);
  },
});
```

## 10. Type Safety

The entire framework is generic over your data type `T`:

```typescript
// Define your data shape once
type SignupData = {
  name: string;
  email: string;
  plan: "basic" | "pro";
};

// TypeScript ensures data and validators match
const wizard: WizardDefinition<SignupData> = {
  id: "signup",
  steps: {
    personal: {
      validate: (data) => {
        // data is inferred as SignupData
        // TypeScript knows about data.name, data.email, data.plan
        return { valid: Boolean(data.name) };
      },
    },
  },
};
```

This prevents data mismatches and provides IDE autocomplete.

## 11. Navigation History Stack

WizardForm maintains a **navigation history stack** that tracks the actual path the user took through the wizard. This solves a fundamental problem with conditional transitions: when going backward, the wizard always returns to the step the user actually came from, regardless of how transitions are configured.

### The Problem

Consider a wizard where the `summary` step uses a resolver for its `previous` transition:

```typescript
summary: {
  previous: {
    type: "resolver",
    resolve: (data) => (data.needsInvoice ? "invoice" : "plan"),
  },
}
```

If the user navigated `personal → plan → invoice → summary`, then changed `needsInvoice` to `false`, pressing "Back" would take them to `plan` — skipping `invoice` even though they came from there.

### The Solution

The history stack records each step as you navigate forward. When `goPrevious()` is called, it pops the last step off the stack and navigates there directly, ignoring `previous` transitions entirely.

```typescript
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => console.log(state),
});

// Navigate forward: each step is pushed onto the history stack
await machine.goNext(); // history: ["personal", "plan"]
await machine.goNext(); // history: ["personal", "plan", "invoice"]

// Go back: pops from history, not from previous transition
await machine.goPrevious(); // history: ["personal", "plan"] — back to "plan"

// Check if history-based back navigation is possible
console.log(machine.snapshot.canGoBack); // true

// Access the full history stack
console.log(machine.history); // ["personal", "plan"]

// Clear history (useful for reset scenarios)
machine.clearHistory(); // history: ["plan"] (keeps current step)
```

### Key Behaviors

- **`goNext()`** pushes the current step onto the stack before navigating
- **`goPrevious()`** pops from the stack (history-first), falls back to `previous` transition if history is empty
- **`goToStep(stepId)`** pushes the current step onto the stack
- **`clearHistory()`** resets the stack to just the current step
- **`canGoBack`** is `true` when the history stack has more than one entry

### React / Vue Integration

The history stack is exposed through the navigation slice:

```typescript
// React
const { navigation } = useWizard({ definition, initialData });
navigation.canGoBack; // boolean — can go back via history
navigation.stepHistory; // StepId[] — the full history stack

// Vue
const { navigation } = useWizard({ definition, initialData });
navigation.canGoBack.value; // boolean
navigation.stepHistory.value; // StepId[]
```

## 12. Step Status Tracking

WizardForm automatically tracks the **status** of every step throughout the wizard lifecycle. This powers navigation bars, progress indicators, and sidebar navigation without manual bookkeeping.

### Step Statuses

Each step has one of six possible statuses:

| Status      | Meaning                               |
| ----------- | ------------------------------------- |
| `pristine`  | Not yet visited                       |
| `active`    | Currently displayed                   |
| `visited`   | Was active, then user navigated away  |
| `completed` | Successfully submitted via `goNext()` |
| `error`     | Validation failed on `goNext()`       |
| `skipped`   | Disabled by guard (`enabled: false`)  |

### Automatic Transitions

Statuses update automatically as users navigate:

```
pristine ──(becomes currentStepId)──▶ active
active ──(goNext succeeds)──▶ completed
active ──(goNext validation fails)──▶ error
active ──(goPrevious / goBack / goTo)──▶ visited
completed / error ──(goTo back)──▶ active
* ──(guard enabled=false)──▶ skipped
skipped ──(guard enabled=true)──▶ pristine
```

### Using Step Statuses

Access step statuses from the state:

```typescript
// Core
const machine = new WizardMachine(definition, context, initialData, {
  onStateChange: (state) => {
    console.log(state.stepStatuses);
    // { personal: "completed", plan: "active", review: "pristine" }
  },
});

// Query a single step
machine.getStepStatus("personal"); // "completed"

// Manual override (e.g., mark a step as needing review)
machine.setStepStatus("personal", "error");
```

### Building a Progress Bar

For a precomputed snapshot, read [`state.progress`](./api/core.md#wizardprogress)
(also exposed as `progress: WizardProgress` on `WizardState`). Step statuses
still make per-step indicators easy:

```typescript
// React
const { state } = useWizard({ definition, initialData });
const { percentage, currentStepIndex, enabledSteps } = state.progress;

function StepIndicator({ stepId }: { stepId: string }) {
  const status = state.stepStatuses[stepId];

  return (
    <div className={`step step-${status}`}>
      {status === "completed" && <CheckIcon />}
      {status === "error" && <AlertIcon />}
      {status === "active" && <CurrentIcon />}
    </div>
  );
}
```

## Putting It Together

Here's how these concepts work together:

```typescript
import { createWizard } from "@gooonzick/wizard-core";

type OnboardingData = {
  name: string;
  companySize: "small" | "medium" | "large";
  wantsTraining: boolean;
};

const wizard = createWizard<OnboardingData>("onboarding")
  .initialStep("name")

  // Step 1: Get user name (static next)
  .step("name", (s) =>
    s.title("What's your name?").required("name").next("company"),
  )

  // Step 2: Get company size (conditional next)
  .step("company", (s) =>
    s
      .title("Company Size")
      .required("companySize")
      .nextWhen([
        { when: (d) => d.wantsTraining, to: "training" },
        { when: () => true, to: "summary" },
      ]),
  )

  // Step 3: Training (conditionally shown, resolver previous)
  .step("training", (s) =>
    s
      .title("Choose Training")
      .enabled((d) => d.wantsTraining)
      .previous({
        type: "resolver",
        resolve: (d) => (d.wantsTraining ? "company" : null),
      })
      .next("summary"),
  )

  // Step 4: Summary (async submit)
  .step("summary", (s) =>
    s.title("Review").onSubmit(async (data, ctx) => {
      await ctx.api.submitOnboarding(data);
    }),
  )

  .onComplete(async (data, ctx) => {
    await ctx.router.navigate("/dashboard");
  })

  .build();
```

This wizard demonstrates:

- **Static transitions** (name → company)
- **Conditional transitions** (company → training or summary based on `wantsTraining`)
- **Step guards** (training step only shows if `wantsTraining`)
- **Resolver transitions** (previous goes back to company if wantsTraining)
- **Async operations** (onSubmit sends data, onComplete redirects)
- **Type safety** (all steps know about OnboardingData fields)
