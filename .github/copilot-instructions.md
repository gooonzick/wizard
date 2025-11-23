# WizardForm Copilot Instructions

## Architecture

**Turbo monorepo** for a framework-agnostic wizard state machine:

```
packages/
├── core/   # @wizard/core - State machine, types, builders, validators
└── react/  # @wizard/react - useWizard hook + granular hooks (useWizardData, useWizardNavigation, etc.)
examples/   # React example apps consuming the packages
```

Packages use `workspace:*` dependencies—core changes are immediately reflected in react.

## Commands

```bash
pnpm build                              # Build all packages
pnpm test                               # Run all tests once
pnpm typecheck                          # TypeScript checks
pnpm lint:fix                           # Auto-fix Biome issues
pnpm knip                               # Detect unused code/deps
turbo run test --filter=@wizard/core    # Single package
```

## Core Concepts

### WizardMachine (`packages/core/src/machine/wizard-machine.ts`)

Single source of truth. All navigation, validation, and events flow through this class. Never bypass it for state changes.

### Three Transition Types

```typescript
{ type: 'static', to: 'stepId' }                    // Direct navigation
{ type: 'conditional', branches: [{ when, to }] }   // Data-driven branching
{ type: 'resolver', resolve: (data, ctx) => stepId } // Async/dynamic routing
```

Use `resolveTransition()` and `evaluateGuard()` from `packages/core/src/machine/transitions.ts`—don't reimplement.

### Type Constraint

All wizard data **must** extend `Record<string, unknown>`:

```typescript
interface MyData extends Record<string, unknown> {
  name: string;
}
```

## Adding Features

### Validators (`packages/core/src/machine/validators.ts`)

```typescript
requiredFields("field1", "field2"); // Multi-field required
createValidator(predicate, errorMsg, field); // Custom predicate
combineValidators(...validators); // Compose validators
createStandardSchemaValidator(schema); // Valibot/ArkType schemas
```

### Guards (`packages/core/src/machine/transitions.ts`)

Compose with `andGuards()`, `orGuards()`, `notGuard()`. Guards must return booleans with no side effects.

### New Events

1. Add to `WizardEvents<T>` in `wizard-machine.ts`
2. Wire through `useWizard` in `packages/react/src/use-wizard.tsx`
3. Test via spies on event handlers (not internal state inspection)

## React Integration

`useWizard()` wraps WizardMachine in React state. For performance-critical UIs, use `WizardProvider` with granular hooks:

- `useWizardData()` - Data and current step
- `useWizardNavigation()` - Navigation state/methods
- `useWizardValidation()` - Validation state
- `useWizardLoading()` - Async operation states
- `useWizardActions()` - Data mutations

**Note:** `useWizard()` accesses private WizardMachine methods via bracket notation. Keep method names stable when refactoring.

## Testing Patterns

Tests in `packages/*/tests/` use Vitest. Prefer event spy assertions over internal inspection:

```typescript
const events: WizardEvents<TestData> = { onStepEnter: vi.fn() };
const machine = new WizardMachine(definition, {}, initialData, events);
await machine.goNext();
expect(events.onStepEnter).toHaveBeenCalledWith("nextStep", expect.any(Object));
```

## Key Files

- `packages/core/src/index.ts` - Core public API (keep clean)
- `packages/core/src/examples/` - Reference patterns for builders and transitions
- `packages/react/src/wizard-provider.tsx` - Context for granular hooks
- `docs/plans/` - Feature planning documents
