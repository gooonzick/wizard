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
