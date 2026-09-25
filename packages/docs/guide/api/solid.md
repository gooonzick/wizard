---
title: Solid API
description: API reference for the @gooonzick/wizard-solid package
---

# Solid API

API reference for `@gooonzick/wizard-solid`.

## `createWizard(options)`

```ts
function createWizard<T extends WizardData>(options: CreateWizardOptions<T>): Wizard<T>;
```

Creates a `WizardMachine` and a `WizardStateManager` and mirrors the manager's four channel snapshots into Solid signals.

### `CreateWizardOptions<T>`

| Option | Type | Default | Notes |
| ------ | ---- | ------- | ----- |
| `definition` | `WizardDefinition<T>` | — | Read once. |
| `initialData` | `T` | — | Read once. Also the default for `actions.reset()`. |
| `context` | `WizardContext` | `{}` | Read once. |
| `plugins` | `WizardPlugin<T>[]` | — | Registered once at creation. |
| `autoDestroy` | `boolean` | `true` | Registers `onCleanup(destroy)` when an owner exists. |
| `onStateChange` | `(state: WizardState<T>) => void` | — | |
| `onStepEnter` | `(stepId: StepId, data: T) => void` | — | |
| `onStepLeave` | `(stepId: StepId, data: T) => void` | — | |
| `onComplete` | `(data: T) => void` | — | |
| `onCancel` | `(data: T) => void \| Promise<void>` | — | |
| `onReset` | `() => void` | — | |
| `onError` | `(error: Error) => void` | — | Machine errors and effect errors thrown during signal updates. |
| `onDataChange` | `(prev: T, next: T, changedFields: (keyof T)[]) => void` | — | |

### `Wizard<T>`

**Reactive getters (read-only)**

| Getter | Type | Channel |
| ------ | ---- | ------- |
| `currentStepId` | `StepId` | state |
| `currentStep` | `WizardStepDefinition<T>` | state |
| `data` | `T` | state |
| `isCompleted` | `boolean` | state |
| `stepStatuses` | `Record<StepId, StepStatus>` | state |
| `progress` | `WizardProgress` | state |
| `isValid` | `boolean` | validation |
| `validationErrors` | `Record<string, string> \| undefined` | validation |
| `canGoNext` | `boolean` | navigation (async) |
| `canGoPrevious` | `boolean` | navigation (async) |
| `canGoBack` | `boolean` | navigation |
| `isFirstStep` | `boolean` | navigation |
| `isLastStep` | `boolean` | navigation (async) |
| `visitedSteps` | `StepId[]` | navigation |
| `availableSteps` | `StepId[]` | navigation (async) |
| `stepHistory` | `StepId[]` | navigation |
| `isValidating` | `boolean` | loading |
| `isSubmitting` | `boolean` | loading |
| `isNavigating` | `boolean` | loading |
| `state` | `WizardStoreState<T>` | state |
| `validation` | `WizardStoreValidation` | validation |
| `navigation` | `WizardStoreNavigation` | navigation |
| `loading` | `WizardStoreLoading` | loading |

**Navigation**

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `goNext()` | `Promise<void>` | Validates, runs `onSubmit`, moves. Rejects on invalid step. Toggles `isNavigating`. |
| `goPrevious()` | `Promise<void>` | Toggles `isNavigating`. |
| `goTo(stepId, options?)` | `Promise<void>` | `GoToOptions`: `skipValidation`, `skipLifecycle`. |
| `goBack(steps?)` | `Promise<void>` | Deprecated — use `goPrevious()`. |
| `goToStep(stepId)` | `Promise<void>` | Deprecated — `goTo(stepId, { skipValidation: true })`. |

**`actions: WizardStoreActions<T>`**

| Action | Signature | Notes |
| ------ | --------- | ----- |
| `updateField` | `<K extends keyof T>(field: K, value: T[K]) => void` | No-op when `Object.is`-equal. |
| `updateData` | `(updater: (data: T) => T) => void` | |
| `setData` | `(data: T) => void` | |
| `validate` | `() => Promise<void>` | Toggles `isValidating`. |
| `validateAll` | `(options?: { updateStatuses?: boolean }) => Promise<ValidationSummary>` | Toggles `isValidating`. |
| `canSubmit` | `() => Promise<boolean>` | |
| `submit` | `() => Promise<void>` | Toggles `isSubmitting`. |
| `reset` | `(data?: T) => void` | Fire-and-forget; errors → `onError`. |
| `cancel` | `() => Promise<void>` | Calls `onCancel`, then resets. |
| `serialize` | `() => WizardSerializedState<T>` | |
| `restore` | `(state: WizardSerializedState<T>) => void` | Fire-and-forget; `WizardRestoreError` → `onError`. |

**Other members**

| Member | Type | Notes |
| ------ | ---- | ----- |
| `field(key)` | `<K extends keyof T>(key: K) => WizardField<T[K]>` | Stable per key. |
| `getMachine()` | `WizardMachine<T>` | |
| `getManager()` | `WizardStateManager<T>` | |
| `destroy()` | `Promise<void>` | Idempotent. |
| `isDestroyed` | `boolean` | |

### `WizardField<V>`

```ts
interface WizardField<V> {
	get value(): V; // reactive
	set value(v: V); // machine.updateField(key, v)
}
```

## Context

### `WizardProvider`

```ts
function WizardProvider<T extends WizardData>(props: WizardProviderProps<T>): JSX.Element;

interface WizardProviderProps<T extends WizardData> {
	wizard: Wizard<T>; // read once; never destroyed by the provider
	children?: JSX.Element;
}
```

### `useWizardContext<T>()`

Returns the nearest provided `Wizard<T>`. Throws `Error("useWizardContext() must be called inside a <WizardProvider wizard={...}>.")` when there is none.

### `hasWizardContext()`

Returns `true` when a `WizardProvider` is above the caller, otherwise `false`. Never throws.

## Re-exports

For convenience the package re-exports `WizardProgress`, `WizardSerializedState` and `WizardRestoreError` from `@gooonzick/wizard-core`, and `WizardStateManager`, `LoadingState`, `NavigationState`, `StateSnapshot`, `SubscriptionChannel`, `ValidationState` from `@gooonzick/wizard-state`.

## See also

- See the [Solid Integration guide](/guide/solid-integration) for usage patterns
