# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Commands

Root workspace uses Turbo to manage monorepo tasks:

- **Build**: `pnpm build` - Build all packages (core, react)
- **Type check**: `pnpm typecheck` - Run TypeScript type checking on all packages
- **Test**: `pnpm test` - Run tests on all packages (runs once via `--run` flag)
- **Test (watch)**: `pnpm test:watch` - Run tests in watch mode
- **Clean**: `pnpm clean` - Remove all `dist/` directories from packages
- **Dev**: `pnpm dev` - Run Vite dev server
- **Lint**: `pnpm lint` - Check code with Biome (formatting, linting)
- **Lint (fix)**: `pnpm lint:fix` - Auto-fix Biome issues
- **Knip**: `pnpm knip` - Detect unused files, dependencies, and exports
- **Syncpack**: `pnpm syncpack:lint` - Check dependency version consistency across packages

To run commands on a single package, use Turbo filters:
- **`turbo run build --filter=@wizard/core`** - Build only core package
- **`turbo run test --filter=@wizard/react`** - Run react tests once
- **`turbo run lint:fix --filter=@wizard/core`** - Fix linting in core package

Individual package commands (run from `packages/core/` or `packages/react/`):
- **`pnpm test`** - Run package tests once
- **`pnpm test:watch`** - Run package tests in watch mode
- **`pnpm build`** - Build this package only
- **`pnpm typecheck`** - Type check this package only

## Monorepo Structure

This is a **Turbo monorepo** with two main packages:

```
packages/
├── core/        # Framework-agnostic wizard state machine
└── react/       # React hooks for the core engine
examples/        # Example applications using the wizard
```

Each package has its own `src/`, `tests/`, `dist/` (build output), and configuration files.

## Architecture Overview

This is a **framework-agnostic state machine** for multi-step wizards. The core wizard engine lives in `packages/core/src/` and is consumed via builder APIs, React hooks, or direct machine instantiation.

### Core Modules (packages/core/src/)

**types/** - Type system
- `base.ts` - Core types (ValidationResult, WizardContext, SyncOrAsync)
- `transitions.ts` - Navigation types (StepTransition union: static/conditional/resolver)
- `step.ts` - Step definitions and lifecycle hooks
- `definition.ts` - Wizard-level configuration
- `context.ts` - Context management patterns

**machine/** - Runtime engine (source of truth for behavior)
- `wizard-machine.ts` - Main state machine: manages step navigation, validation, data updates, event emission
- `transitions.ts` - Helper functions (`resolveTransition`, `evaluateGuard`) for determining next steps and checking guards
- `validators.ts` - Validator utilities (`combineValidators`, `requiredFields`, `createStandardSchemaValidator`)

**builders/** - Fluent APIs
- `create-step.ts` - StepBuilder: chainable API for building steps
- `create-wizard.ts` - WizardBuilder & createLinearWizard(): chainable API for building wizards

**index.ts** - Public API (re-exports all public types and functions)

### React Integration (packages/react/src/)

- `use-wizard.tsx` - Main React hook wrapping WizardMachine with full state management
- `use-wizard-granular.tsx` - Fine-grained hooks for selective subscriptions (useWizardData, useWizardActions, useWizardNavigation, useWizardLoading, useWizardValidation)
- `wizard-provider.tsx` - Context provider for sharing wizard instance across components
- `internal/wizard-state-manager.ts` - Internal state management utilities
- `index.ts` - Public API for React package

### Key Design Principles

1. **Declarative definitions** - Wizards are data, not imperative control flow. Define in `WizardDefinition<T>` or use fluent builders.
2. **State machine architecture** - All navigation, validation, and completion go through `WizardMachine`. This is the single source of truth for behavior.
3. **Type-safe generics** - Data type `T` extends `Record<string, unknown>` throughout. Ensures type safety across all wizard operations.
4. **Extensible context** - `WizardContext` is designed to be extended. Use `createWizardContext()` and context helper interfaces (LoggerContext, RouterContext, ApiContext).
5. **Three transition types** - Static (hardcoded target), Conditional (data-driven branching), Resolver (async decision-making).

## Common Patterns

### Adding New Wizard Behavior

If adding navigation rules, guards, submission logic, or validation:
1. **Always go through WizardMachine** or its helper functions
2. Use `resolveTransition()` and `evaluateGuard()` from `packages/core/src/machine/transitions.ts` instead of re-implementing branching
3. Add corresponding event handler to `WizardEvents<T>` and wire through `useWizard()` if UI-facing
4. Extend tests in the relevant package's `tests/` directory to verify behavior

### Adding a Validator

Use existing validator utilities in `packages/core/src/machine/validators.ts`:
- `createValidator(predicate, errorMsg, fieldName)` - Single field validator
- `requiredFields(...fields)` - Multi-field required validator
- `combineValidators(...validators)` - Combine multiple validators
- `createStandardSchemaValidator(schema, options)` - Wrap Standard Schema validators (Valibot, ArkType, etc.)

For step validation, assign to `step.validate` in step definition.

### Adding Context Extensions

Define your context interface extending WizardContext:
```typescript
interface MyContext extends WizardContext {
  api: ApiClient;
  router: Router;
}
const ctx: MyContext = createWizardContext({ /* ... */ });
```
Then use in validators, hooks, and transition resolvers via the `ctx` parameter.

### Adding a New Transition Type

Transition types are defined in `packages/core/src/types/transitions.ts`. Update:
1. `StepTransition<T>` union
2. `resolveTransition()` in `packages/core/src/machine/transitions.ts` to handle the new type
3. Add builder methods in `packages/core/src/builders/create-step.ts` if needed

## Testing

- Tests live in each package's `tests/` directory and use Vitest
- Each package has its own `vitest.config.ts` (tests run in `tests/**/*.test.ts`)
- Core tests run in Node environment, React tests use jsdom for DOM APIs
- Unit test the `WizardMachine` class directly for core behavior
- Prefer spying on event handlers (`onStateChange`, `onStepEnter`, `onComplete`) over inspecting internal state
- Example: `packages/core/tests/wizard-machine.test.ts` shows machine instantiation and event handling
- Test files in core: `wizard-machine.test.ts`, `transitions.test.ts`, `validators.test.ts`, `builders.test.ts`, `edge-cases.test.ts`, `new-features.test.ts`, `performance.test.ts`

## Build and Publishing

- **Core package build**: `packages/core/src/index.ts` is the entry point (Vite builds to `dist/`)
- **React package build**: `packages/react/src/index.ts` is the entry point (depends on `@wizard/core` via `workspace:*`)
- **Output format**: ESM only (configured in each package's `vite.config.ts`)
- **Vite implementation**: Uses `rolldown-vite` (Rolldown-based Vite fork) for faster builds
- **Types**: Generated by `vite-plugin-dts` based on `tsconfig.build.json`
- **package.json fields** (main, module, exports, types) point consumers to correct bundles
- Keep the public API surface in each package's `index.ts` clean since consumers rely on published types
- **Linting/Formatting**: Uses Biome (configured in `biome.json`) with tab indentation and double quotes

## Important Implementation Notes

- **React hook internals** - `useWizard()` intentionally accesses private WizardMachine members (e.g., `machine["resolveNextStep"]()`). Keep those method names stable or update the hook when refactoring.
- **Guard evaluation** - Guards are sync or async boolean functions. Use guard combinators (`andGuards`, `orGuards`, `notGuard`) for composition instead of inline logic.
- **Lifecycle order** - Step lifecycle is: onEnter → validation/submission → onLeave. Ensure hooks don't contradict each other.
- **Error handling** - Async operations should propagate errors cleanly (avoid throwing raw values). WizardMachine event handlers expect consistent error signatures.
- **Disabled steps** - Steps with `enabled: false` are skipped during navigation. `WizardMachine` automatically handles skip logic in `goNext()` and `goPrevious()`.
- **Monorepo dependencies** - `@wizard/react` depends on `@wizard/core` via `workspace:*` in pnpm. Changes to core are immediately reflected in react tests and builds.

## Additional Resources

See `.github/copilot-instructions.md` for additional development guidelines on state machine behavior, type patterns, and transition composition.
