---
layout: home

hero:
  name: WizardForm
  text: Declarative, type-safe wizard framework for TypeScript
  tagline: Build powerful multi-step forms with confidence
  image:
    src: /wizard-logo.png
    alt: WizardForm Logo
    height: 300px
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

For React integration:

```bash
npm install @gooonzick/wizard-react
```

## Define Your First Wizard

```typescript
import { createWizard } from "@gooonzick/wizard-core";

const wizard = createWizard()
  .addStep({
    id: "personal-info",
    validate: (data) => {
      if (!data.name) return { valid: false, errors: ["Name is required"] };
      return { valid: true };
    },
  })
  .addStep({
    id: "contact-info",
    validate: (data) => {
      if (!data.email) return { valid: false, errors: ["Email is required"] };
      return { valid: true };
    },
  })
  .build();
```

## Next Steps

- 📖 [Getting Started Guide](/guide/getting-started) - Learn the basics
- 🎨 [React Integration](/guide/react-integration) - Use with React or Vue
- 📚 [API Reference](/guide/api/core) - Detailed API documentation
