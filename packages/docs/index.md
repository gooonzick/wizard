---
layout: home

hero:
  name: 🧙 WizardForm
  text: Declarative, type-safe wizard framework for TypeScript
  tagline: Build powerful multi-step forms with confidence
  image:
    src: /wizard-logo.png
    alt: WizardForm Logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/gooonzick/wizard

features:
  - icon: 🚀
    title: Declarative Wizard Definitions
    details: Define your wizards using simple, type-safe configurations. No imperative control flow to manage.
  - icon: ⚡
    title: Framework Agnostic Core
    details: Use the core wizard engine with React, Vue, or any framework. State machine architecture ensures consistent behavior.
  - icon: 🔒
    title: Type Safety Throughout
    details: Full TypeScript support from wizard definition to runtime. Catch errors before they reach production.
  - icon: 🔄
    title: Flexible Transitions
    details: Static routes, conditional branching, or async resolvers - handle any navigation pattern with ease.
  - icon: ✅
    title: Built-in Validation
    details: Sync or async validators, required fields, and integration with Standard Schema validators (Valibot, ArkType, etc.).
  - icon: 🎯
    title: Lifecycle Hooks
    details: Run custom logic on step enter/leave, wizard completion, or state changes with full event system.
---

## Quick Start

Install the core package:

```bash
npm install @gooonzick/wizard-core
```

For React or Vue integration:

```bash
npm install @gooonzick/wizard-react
# or
npm install @gooonzick/wizard-vue
```

## Define Your First Wizard

```typescript
import { createWizard } from "@gooonzick/wizard-core";

type FormData = { name: string; email: string };

const wizard = createWizard<FormData>("signup")
  .initialStep("personal-info")
  .addStep({
    id: "personal-info",
    next: { type: "static", to: "contact-info" },
    validate: (data) => ({
      valid: Boolean(data.name),
      errors: data.name ? undefined : { name: "Name is required" },
    }),
  })
  .addStep({
    id: "contact-info",
    previous: { type: "static", to: "personal-info" },
    validate: (data) => ({
      valid: Boolean(data.email),
      errors: data.email ? undefined : { email: "Email is required" },
    }),
  })
  .build();
```

## Next Steps

- 📖 [Getting Started Guide](/guide/getting-started) - Learn the basics
- 🎨 [React Integration](/guide/react-integration) · [Vue Integration](/guide/vue-integration)
- 📚 [API Reference](/guide/api/core) - Detailed API documentation
