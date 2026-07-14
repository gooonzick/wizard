# WizardForm Documentation

Welcome to the WizardForm framework documentation. This directory mirrors the published guides under `packages/docs` for easy repo browsing.

## Start Here

**New to WizardForm?** Start with the [Getting Started](./getting-started.md) guide for installation and your first wizard.

## Documentation Guide

### For Framework Users

| Guide | Purpose | Best For |
| ----- | ------- | -------- |
| [Getting Started](./getting-started.md) | Installation and quick start | First-time users |
| [Core Concepts](./core-concepts.md) | How WizardForm works | Learning fundamentals |
| [Defining Wizards](./defining-wizards.md) | Ways to build wizards | Building your first wizard |
| [Plugins](./plugins.md) | Global lifecycle interception | Analytics, logging, veto |
| [React Integration](./react-integration.md) | `useWizard()` in React | React developers |
| [Vue Integration](./vue-integration.md) | Composables in Vue 3 | Vue developers |
| [API Reference](./api-reference.md) | Type signatures by package | Detailed lookups |
| [CI/CD](./ci-cd.md) | Release and pipeline notes | Maintainers |

### API by package

| Package | Doc |
| ------- | --- |
| Core | [api/core.md](./api/core.md) |
| React | [api/react.md](./api/react.md) |
| Vue | [api/vue.md](./api/vue.md) |

### Quick Navigation

#### I want to...

- **Get started quickly** → [Getting Started](./getting-started.md)
- **Understand state machines & transitions** → [Core Concepts](./core-concepts.md)
- **Validate all steps at once** → [Core Concepts](./core-concepts.md) — *Validating All Steps*
- **Build a wizard** → [Defining Wizards](./defining-wizards.md)
- **Use WizardForm in React** → [React Integration](./react-integration.md)
- **Use WizardForm in Vue** → [Vue Integration](./vue-integration.md)
- **Add plugins** → [Plugins](./plugins.md)
- **Look up a type or function** → [API Reference](./api-reference.md)

## Package Documentation

- **@gooonzick/wizard-core**: [packages/core/README.md](../packages/core/README.md)
- **@gooonzick/wizard-react**: [packages/react/README.md](../packages/react/README.md)
- **@gooonzick/wizard-vue**: [packages/vue/README.md](../packages/vue/README.md)
- **@gooonzick/wizard-state**: [packages/state/README.md](../packages/state/README.md) (internal adapter state layer)

## Examples

- [examples/react-examples](../examples/react-examples) — registration, history, reset/cancel, persistence, **provider**
- [examples/vue-examples](../examples/vue-examples) — useWizard, provider, field binding, history, reset/cancel, persistence

## Published docs site

The VitePress site is built from `packages/docs`:

```sh
pnpm docs:dev
pnpm docs:build
```

## License

All documentation is under the same license as the source code.
