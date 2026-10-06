
# Svelte Package (`@gooonzick/wizard-svelte`)

Two entry points:

| Import specifier | Primitive | Requires |
| ---------------- | --------- | -------- |
| `@gooonzick/wizard-svelte` | classic store contract (`subscribe`) | Svelte 4 **or** 5 |
| `@gooonzick/wizard-svelte/runes` | Svelte 5 runes (`$state`) | Svelte 5 **only** |

The declared peer range is `"svelte": "^4.0.0 || ^5.0.0"` and describes the main entry;
export conditions cannot express a per-subpath peer, so the Svelte 5 requirement of
`/runes` is documented rather than enforced by npm.

Exports are **named only** — there is no `default` export on either entry.

## createWizardStore

```ts
function createWizardStore<T extends WizardData>(
  options: CreateWizardStoreOptions<T>,
): WizardStore<T>;
```

### CreateWizardStoreOptions&lt;T&gt;

```ts
interface CreateWizardStoreOptions<T> {
  /** Read ONCE at creation — NOT reactive. Recreate the store to reconfigure. */
  definition: WizardDefinition<T>;
  /** Read ONCE at creation — NOT reactive. */
  initialData: T;
  /** Read ONCE at creation — NOT reactive. Defaults to `{}`. */
  context?: WizardContext;

  onStateChange?: (state: WizardState<T>) => void;
  onStepEnter?: (stepId: StepId, data: T) => void;
  onStepLeave?: (stepId: StepId, data: T) => void;
  onComplete?: (data: T) => void;
  onCancel?: (data: T) => void | Promise<void>;
  onReset?: () => void;
  onError?: (error: Error) => void;
  onDataChange?: (prevData: T, nextData: T, changedFields: (keyof T)[]) => void;

  /**
   * Plugins registered once at machine creation (read once, NOT reactive).
   * `onInit` is dispatched fire-and-forget and may run concurrently with the
   * initial step's `onEnter`.
   */
  plugins?: WizardPlugin<T>[];

  /**
   * When true (default) the store registers `onDestroy(() => void store.destroy())`.
   * The registration is wrapped in try/catch, so calling `createWizardStore()`
   * outside component initialisation is safe — you just own `destroy()` yourself.
   */
  autoDestroy?: boolean;
}
```

### WizardStore&lt;T&gt;

```ts
interface WizardStore<T> extends Readable<WizardSnapshot<T>> {
  /** Per-channel stores for fine-grained subscriptions. */
  readonly state: Readable<WizardStoreState<T>>;
  readonly validation: Readable<WizardStoreValidation>;
  readonly navigation: Readable<WizardStoreNavigation>;
  readonly loading: Readable<WizardStoreLoading>;

  readonly actions: WizardStoreActions<T>;

  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  /** @deprecated Use goPrevious() instead */
  goBack(steps?: number): Promise<void>;
  goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
  /** @deprecated Use goTo(stepId) instead */
  goToStep(stepId: StepId): Promise<void>;

  /** Two-way store for one top-level field. Stable reference per key. */
  field<K extends keyof T>(key: K): Writable<T[K]>;

  getMachine(): WizardMachine<T>;
  getManager(): WizardStateManager<T>;

  /** Idempotent. Fire-and-forget-safe. Tears down plugins via the manager. */
  destroy(): Promise<void>;
  readonly isDestroyed: boolean;
}
```

The store itself is a `Readable`, never a `Writable`. `bind:value={$wizard.data.x}` is a
compile error by design — write through `field(key)` or `actions.*`.

### Value shape

`$wizard` yields a flattened merge of the four slices, with no key collisions:

```ts
interface WizardStoreState<T> {
  currentStepId: StepId;
  currentStep: WizardStepDefinition<T>;
  data: T;
  isCompleted: boolean;
  stepStatuses: Record<StepId, StepStatus>;
  progress: WizardProgress;
}

interface WizardStoreValidation {
  isValid: boolean;
  validationErrors?: Record<string, string>;
}

interface WizardStoreNavigation {
  canGoNext: boolean;
  canGoPrevious: boolean;
  canGoBack: boolean; // true when the history stack has > 1 entry
  isFirstStep: boolean;
  isLastStep: boolean;
  visitedSteps: StepId[];
  availableSteps: StepId[];
  stepHistory: StepId[];
}

interface WizardStoreLoading {
  isValidating: boolean;
  isSubmitting: boolean;
  isNavigating: boolean;
  /** True while a lazy step's implementation loads (WIZ-013). Mirrored from the machine. */
  isLoadingStep: boolean;
}

interface WizardSnapshot<T>
  extends WizardStoreState<T>,
    WizardStoreValidation,
    WizardStoreNavigation,
    WizardStoreLoading {}
```

The aggregate value is memoised on the four cached slice references, so a notify that
changed nothing returns the same object identity.

### WizardStoreActions&lt;T&gt;

```ts
interface WizardStoreActions<T> {
  updateData(updater: (data: T) => T): void;
  setData(data: T): void;
  /** Calls machine.updateField directly — keeps the Object.is no-op guard
   *  and the authoritative changedFields = [field] (WIZ-010). */
  updateField<K extends keyof T>(field: K, value: T[K]): void;
  validate(): Promise<void>;
  validateAll(options?: { updateStatuses?: boolean }): Promise<ValidationSummary>;
  canSubmit(): Promise<boolean>;
  submit(): Promise<void>;
  /** Fire-and-forget (`void manager.runReset(...)`), mirroring React. */
  reset(data?: T): void;
  cancel(): Promise<void>;
  serialize(): WizardSerializedState<T>;
  /** Fire-and-forget (`void manager.runRestore(...)`), mirroring React. */
  restore(state: WizardSerializedState<T>): void;
  /** WIZ-013: prefetch a lazy step's implementation without navigating. Does not set isLoadingStep; the caller owns the rejection. */
  preloadStep(stepId: StepId): Promise<void>;
}
```

`reset` and `restore` return `void`, not `Promise<void>`. Their rejection path is
terminated: a malformed snapshot raises `WizardRestoreError`, which is forwarded to the
`onError` option instead of becoming an unhandled rejection.

Loading flags are owned by `WizardStateManager` (the React model): `validate` /
`validateAll` toggle `isValidating`, `submit` toggles `isSubmitting`, navigation toggles
`isNavigating`, and `reset` / `cancel` / `restore` go through `manager.runReset` /
`runCancel` / `runRestore`. `isLoadingStep` is the exception: it is not tracked by the manager but
mirrored from `machine.snapshot.isLoadingStep`, and `actions.preloadStep` never sets it.

## Context helpers (store layer)

```ts
/** Must be called during component initialisation. Returns the same store. */
function setWizardContext<T extends WizardData>(store: WizardStore<T>): WizardStore<T>;

/** @throws Error when no store was published by an ancestor. */
function getWizardContext<T extends WizardData>(): WizardStore<T>;

/** Non-throwing probe — returns false outside component initialisation. */
function hasWizardContext(): boolean;
```

## Runes entry (`@gooonzick/wizard-svelte/runes`)

```ts
function createWizard<T extends WizardData>(options: CreateWizardOptions<T>): Wizard<T>;

function setWizardContext<T extends WizardData>(wizard: Wizard<T>): Wizard<T>;
function getWizardContext<T extends WizardData>(): Wizard<T>;
function hasWizardContext(): boolean;
```

`CreateWizardOptions<T>` is structurally identical to `CreateWizardStoreOptions<T>`. It is
redeclared inside `src/runes/` because `svelte-package` emits declarations with
`libRoot=src/runes`; an import escaping that root would yield dangling `.d.ts` references.

The runes layer uses its **own** context key (a distinct `Symbol`), so mixing both layers in
one component tree cannot cross-contaminate.

```ts
interface WizardField<V> {
  get value(): V;
  set value(v: V);
}

interface Wizard<T> {
  // Flat reactive getters — same key set as WizardSnapshot<T>
  readonly currentStepId: StepId;
  readonly currentStep: WizardStepDefinition<T>;
  readonly data: T;
  readonly isCompleted: boolean;
  readonly stepStatuses: Record<StepId, StepStatus>;
  readonly progress: WizardProgress;
  readonly isValid: boolean;
  readonly validationErrors: Record<string, string> | undefined;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  readonly canGoBack: boolean;
  readonly isFirstStep: boolean;
  readonly isLastStep: boolean;
  readonly visitedSteps: StepId[];
  readonly availableSteps: StepId[];
  readonly stepHistory: StepId[];
  readonly isValidating: boolean;
  readonly isSubmitting: boolean;
  readonly isNavigating: boolean;
  readonly isLoadingStep: boolean;

  // Slice getters — parity with the store layer's sub-stores
  readonly state: WizardStoreState<T>;
  readonly validation: WizardStoreValidation;
  readonly navigation: WizardStoreNavigation;
  readonly loading: WizardStoreLoading;

  readonly actions: WizardStoreActions<T>;

  goNext(): Promise<void>;
  goPrevious(): Promise<void>;
  /** @deprecated */ goBack(steps?: number): Promise<void>;
  goTo(stepId: StepId, options?: GoToOptions): Promise<void>;
  /** @deprecated */ goToStep(stepId: StepId): Promise<void>;

  /** `bind:value={f.value}` compatible. Stable reference per key. */
  field<K extends keyof T>(key: K): WizardField<T[K]>;

  getMachine(): WizardMachine<T>;
  getManager(): WizardStateManager<T>;
  destroy(): Promise<void>;
  readonly isDestroyed: boolean;
}
```

Reactivity is `$state.raw` reassignment driven by manager subscriptions — the snapshots are
frozen and reference-cached, and a deep `$state` proxy would fight both. There is
deliberately **no `$effect`** in the layer: outside a component it would require
`$effect.root()` and manual disposal, a teardown hazard for a library.

Consequence: `wizard.data` is not deeply reactive. `wizard.data.name = "x"` is a silent
no-op *and* bypasses the machine — use `field()` or `actions.updateField`.

## Re-exports

The main entry re-exports the core/state pieces consumers need, so a direct dependency on
`@gooonzick/wizard-state` is unnecessary:

```ts
import {
  WizardRestoreError,
  WizardStateManager,
  type LoadingState,
  type NavigationState,
  type StateSnapshot,
  type SubscriptionChannel,
  type ValidationState,
  type WizardProgress,
  type WizardSerializedState,
} from "@gooonzick/wizard-svelte";
```

## Exported helper types

Action function aliases are exported for typing callbacks and wrappers:

```ts
import type {
  CancelFn,
  CanSubmitFn,
  ResetFn,
  RestoreFn,
  SerializeFn,
  SetDataFn,
  SubmitFn,
  UpdateDataFn,
  UpdateFieldFn,
  ValidateAllFn,
  ValidateFn,
  // …
} from "@gooonzick/wizard-svelte";
```

## Related Documentation

- See the [Svelte Integration guide](../svelte-integration.md) for usage patterns
- See the [Core API](./core.md) for the framework-agnostic wizard engine
- See the [React API](./react.md) and [Vue API](./vue.md) for the other bindings
