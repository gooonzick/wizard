# WIZ-002: goTo(stepId, options?) — Arbitrary Navigation

**Date:** 2026-03-30
**Status:** Approved
**Package:** `@gooonzick/wizard-core`, `@gooonzick/wizard-react`, `@gooonzick/wizard-vue`
**Effort:** S (2–3 hours)

## Problem

A user on the `summary` step sees a progress bar with steps. They want to click `personal` to go back and edit it. The current API only supports `goNext()` and `goPrevious()`. The existing `goToStep(stepId)` method provides basic arbitrary navigation but lacks validation before leaving the current step and has no way to skip guards or lifecycle hooks.

## Decision

Rename `goToStep` → `goTo` with an optional `GoToOptions` parameter. Keep `goToStep` as a `@deprecated` alias. The new `goTo` validates the current step by default (consistent with `goNext`), checks target guards, and runs lifecycle hooks — all skippable via options. Throws on all failures (same as current behavior).

## API

### GoToOptions

```typescript
interface GoToOptions {
  skipValidation?: boolean;   // default: false
  skipGuards?: boolean;       // default: false
  skipLifecycle?: boolean;    // default: false
}
```

### WizardMachine.goTo

```typescript
async goTo(stepId: StepId, options?: GoToOptions): Promise<void>
```

### Deprecated goToStep

```typescript
/** @deprecated Use goTo(stepId) instead. Will be removed in next major version. */
async goToStep(stepId: StepId): Promise<void> {
  return this.goTo(stepId, { skipValidation: true });
}
```

The deprecated alias passes `skipValidation: true` to preserve current `goToStep` behavior (no validation before leaving).

## Behavior

1. Verify `stepId` exists in `definition.steps` — throw `WizardNavigationError("not-found")` if not
2. If navigating to current step — no-op, return immediately
3. If `skipValidation !== true` → validate current step; throw `WizardValidationError` if invalid
4. If `skipGuards !== true` → evaluate `enabled` guard on target; throw `WizardNavigationError("disabled")` if disabled
5. If `skipLifecycle === true` → bypass lifecycle hooks, directly update state (no `onLeave`/`onEnter`)
6. Otherwise → call `navigateToStep(stepId)` as normal (handles `onLeave`, history push, state update, `onEnter`)
7. Emit `onStateChange`

## skipLifecycle Implementation

Extend the private `navigateToStep` options parameter (already accepts `{ pushToHistory }`) with `skipLifecycle`:

```typescript
private async navigateToStep(
  stepId: StepId,
  options?: { pushToHistory?: boolean; skipLifecycle?: boolean },
): Promise<void>
```

When `skipLifecycle: true`:
- Skip `currentStep.onLeave` and `events.onStepLeave`
- Skip `targetStep.onEnter` and `events.onStepEnter`
- Still push to history, update `currentStepId`, update `visitedSteps`, call `notifyStateChange`

## Exports

New export from `packages/core/src/index.ts`:

```typescript
export { type GoToOptions } from "./machine/wizard-machine";
```

## Framework Integration

### React (`packages/react/src/use-wizard.tsx`)

- Add `goTo(stepId, options?)` wrapping `machine.goTo(stepId, options)` with `isNavigating` loading state
- Keep `goToStep` as deprecated wrapper calling `goTo(stepId, { skipValidation: true })`
- Update navigation return type and granular hooks

### Vue (`packages/vue/src/use-wizard.ts`)

- Same pattern: add `goTo`, deprecate `goToStep`
- Update return types in `packages/vue/src/types.ts`

## Tests

| # | Test case | Expected |
|---|-----------|----------|
| 1 | `goTo` to an existing enabled step | Success, navigates |
| 2 | `goTo` to a non-existing step | `WizardNavigationError("not-found")` |
| 3 | `goTo` to current step | No-op |
| 4 | `goTo` with invalid current step, no `skipValidation` | `WizardValidationError` |
| 5 | `goTo` with invalid current step + `skipValidation: true` | Success |
| 6 | `goTo` to a disabled step, no `skipGuards` | `WizardNavigationError("disabled")` |
| 7 | `goTo` to a disabled step + `skipGuards: true` | Success |
| 8 | `goTo` with `skipLifecycle: true` | No `onLeave`/`onEnter` called |
| 9 | `goTo` without `skipLifecycle` | `onLeave`/`onEnter` called in order |
| 10 | `goTo` pushes to navigation history | History updated |
| 11 | `goToStep` (deprecated) still works, skips validation | Backwards-compatible |

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/machine/wizard-machine.ts` | Add `GoToOptions`, add `goTo`, deprecate `goToStep`, extend `navigateToStep` options |
| `packages/core/src/index.ts` | Export `GoToOptions` type |
| `packages/react/src/use-wizard.tsx` | Add `goTo`, deprecate `goToStep` |
| `packages/react/src/use-wizard-granular.tsx` | Add `goTo` to navigation hook |
| `packages/vue/src/use-wizard.ts` | Add `goTo`, deprecate `goToStep` |
| `packages/vue/src/types.ts` | Add `goTo` to navigation type |
| `packages/core/tests/` | New test cases for `goTo` |

## Breaking Changes

- `goToStep` is deprecated but still works — no immediate break
- `goTo` validates by default (unlike `goToStep`) — new behavior, not a break since `goTo` is a new method
