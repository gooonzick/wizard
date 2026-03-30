# 🧙‍♂️ @gooonzick/wizard — Extension Specification & Backlog

## Table of Contents

- [1. Current State Overview](#1-current-state-overview)
- [2. Competitor Analysis](#2-competitor-analysis)
- [3. Feature Backlog](#3-feature-backlog)
  - [Tier 1 — Quick Wins](#tier-1--quick-wins-low-effort-high-impact)
  - [Tier 2 — Core Enhancements](#tier-2--core-enhancements-medium-effort-high-impact)
  - [Tier 3 — Strategic Features](#tier-3--strategic-features-high-effort-strategic-impact)

---

## 1. Current State Overview

### What is Already Implemented

| Feature                                               | Status | Package |
| ----------------------------------------------------- | ------ | ------- |
| Declarative wizard description (definition object)    | ✅     | `core`  |
| Builder Pattern (fluent API)                          | ✅     | `core`  |
| 3 transition types (static / conditional / resolver)  | ✅     | `core`  |
| Guards (enabled) with combinators (and / or / not)    | ✅     | `core`  |
| Lifecycle hooks (onEnter / onLeave / onSubmit)        | ✅     | `core`  |
| Validation (custom + Standard Schema / Zod / Valibot) | ✅     | `core`  |
| Typed context (WizardContext with extensions)         | ✅     | `core`  |
| createLinearWizard helper                             | ✅     | `core`  |
| React hook (useWizard) + granular hooks + provider    | ✅     | `react` |
| Vue 3 composable (useWizard) + granular + provider    | ✅     | `vue`   |
| Framework-agnostic architecture                       | ✅     | `core`  |
| Navigation History Stack (WIZ-001)                    | ✅     | `core`  |

### Architectural Decisions

- **Core** (`WizardMachine`) — a finite state machine operating on `WizardDefinition<TData>`
- **Integrations** — thin wrappers subscribing to `onStateChange`
- **Typing** — generics over `TData` are threaded through the entire chain
- **Transitions** — three strategies: `static` (string), `conditional` (array of `{ when, to }`), `resolver` (async function)

---

## 2. Competitor Analysis

### Feature Matrix

| Feature                   | gooonzick/wizard   | react-use-wizard | react-step-wizard | use-wizard  | react-albus | XState (raw) | xstate-wizards | SurveyJS    | Formiz   | react-multistep v6 | @robo-wizard |
| ------------------------- | ------------------ | ---------------- | ----------------- | ----------- | ----------- | ------------ | -------------- | ----------- | -------- | ------------------ | ------------ |
| Framework-agnostic core   | ✅                 | ❌ React         | ❌ React          | ❌ React    | ❌ React    | ✅           | ✅             | ✅          | ❌ React | ❌ React           | ✅           |
| TypeScript first          | ✅                 | ✅               | ❌                | ❌          | ❌          | ✅           | ✅             | ✅          | ✅       | ✅                 | ✅           |
| Conditional branching     | ✅                 | ❌               | ❌                | ✅ nested   | ✅ onNext   | ✅           | ✅             | ✅          | ❌       | ❌                 | ❌           |
| Async transitions         | ✅ resolver        | ✅ handleStep    | ❌                | ❌          | ❌          | ✅ actors    | ✅             | ❌          | ❌       | ❌                 |
| Guard combinators         | ✅                 | ❌               | ❌                | ❌          | ❌          | ✅ guards    | ✅             | ❌          | ❌       | ❌                 | ❌           |
| Builder pattern           | ✅                 | ❌               | ❌                | ❌          | ❌          | ✅ setup()   | ✅ createSpell | ❌ JSON     | ❌       | ❌                 |
| Schema validation         | ✅ Standard Schema | ❌               | ❌                | ❌          | ❌          | ❌ (DIY)     | ❌             | ✅ built-in | ✅       | ❌                 | ❌           |
| **Navigation history**    | ✅                 | ❌               | ❌                | ✅ 2 stacks | ✅ history  | ✅           | ✅             | ✅          | ❌       | ❌                 | ❌           |
| **goTo(stepId)**          | ❌                 | ❌               | ✅                | ❌          | ✅ push(id) | ✅           | ✅             | ✅          | ❌       | ❌                 | ❌           |
| **Step status tracking**  | ❌                 | ❌               | ❌                | ❌          | ❌          | ✅ (DIY)     | ✅             | ✅          | ❌       | ❌                 | ❌           |
| **Progress API**          | ❌                 | ❌               | ❌                | ❌          | ❌          | ❌           | ❌             | ✅          | ❌       | ✅                 | ❌           |
| **Reset / Cancel**        | ❌                 | ❌               | ❌                | ❌          | ❌          | ✅           | ✅             | ✅          | ✅       | ❌                 | ❌           |
| **State persistence**     | ❌                 | ❌               | ❌                | ❌          | ❌          | ✅ persist   | ✅ sessions    | ✅          | ❌       | ✅ server          | ❌           |
| **Middleware / plugins**  | ❌                 | ❌               | ❌                | ❌          | ❌          | ✅ actions   | ✅             | ❌          | ❌       | ❌                 | ❌           |
| **Router integration**    | ❌                 | ❌               | ❌                | ❌          | ✅          | ❌           | ❌             | ❌          | ❌       | ❌                 | ✅           |
| **Sub-wizards**           | ❌                 | ❌               | ❌                | ✅ nested   | ❌          | ✅ spawn     | ✅             | ✅ pages    | ❌       | ❌                 | ❌           |
| **Validate all steps**    | ❌                 | ❌               | ❌                | ❌          | ❌          | ❌           | ❌             | ✅          | ❌       | ❌                 | ❌           |
| **DevTools / visualizer** | ❌                 | ❌               | ❌                | ❌          | ❌          | ✅ Stately   | ✅ outline     | ✅          | ❌       | ❌                 | ❌           |

### Key Takeaway

`gooonzick/wizard` already outperforms most competitors in its foundation: typing, declarative approach, framework-agnostic architecture, conditional branching, guard combinators, and Standard Schema. However, it lags behind in **runtime capabilities** — navigation, step states, persistence, and extensibility. Closing these gaps will make the library an undisputed leader in its niche.

---

## 3. Feature Backlog

---

### Tier 1 — Quick Wins (Low effort, High impact)

---

#### WIZ-001: Navigation History Stack ✅

**Priority:** 🔴 Critical
**Effort:** S (2–4 hours)
**Package:** `@gooonzick/wizard-core`
**Status:** ✅ Implemented

##### Problem

Currently `WizardMachine` only stores `currentStepId`. When a user navigates `personal → plan → invoice → summary` and clicks "Back", the machine calls the `previous` resolver/transition to determine the previous step. However, with conditional transitions, the resolver doesn't know where the user actually came from. For example, if the `summary` step has `previous: { type: 'resolver', resolve: (data) => data.needsInvoice ? 'invoice' : 'plan' }`, and the user changed `needsInvoice` from `true` to `false` during the flow — the resolver will return `plan`, even though the user actually came from `invoice`.

##### Solution

Add a `navigationHistory: StepId[]` array to the internal state of `WizardMachine`. Each transition (goNext) pushes the current `stepId` onto the stack. `goPrevious` by default goes back to the last element of the stack (pop), rather than computing the `previous` transition.

##### API

```typescript
// New in WizardState<TData>
interface WizardState<TData> {
  // ... existing fields
  navigationHistory: StepId[]; // stack of visited steps
  canUndo: boolean; // navigationHistory.length > 0
}

// New WizardMachine methods
class WizardMachine<TData> {
  getHistory(): StepId[]; // returns a copy of the stack
  clearHistory(): void; // clears the stack (for reset)
}
```

##### Behavior

- `goNext()` → before transitioning, pushes the current `stepId` onto `navigationHistory`
- `goPrevious()` → if `navigationHistory` is not empty, does `pop()` and transitions to that step; if empty, falls back to `previous` transition as before
- `goTo(stepId)` (WIZ-002) → pushes the current `stepId` onto `navigationHistory`
- `reset()` (WIZ-005) → clears `navigationHistory`

##### Impact on Existing Code

- `WizardState` is extended with a new field (breaking change: minor, field is additive)
- `goPrevious()` changes its logic (potential breaking change — a `useHistory: boolean` option in config is needed for backward compatibility)
- React/Vue integrations receive `canUndo` via state automatically

##### Tests

- Linear wizard: history = [step1, step2], goPrevious → step2
- Conditional wizard: navigated A→B→D, goPrevious → B (not C, even if resolver would return C)
- goTo(step) adds to history
- reset() clears history
- `useHistory: false` — old behavior via resolvers

---

#### WIZ-002: goTo(stepId) — Arbitrary Navigation

**Priority:** 🔴 Critical
**Effort:** S (2–3 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

A user on the `summary` step sees a progress bar with steps. They want to click on `personal` and go back to edit it. The current API does not support arbitrary navigation — only `goNext()` and `goPrevious()`. The developer has to call `goPrevious()` in a loop, which is unreliable and ugly.

##### Solution

A `goTo(stepId, options?)` method on `WizardMachine`, allowing navigation to any step with optional skipping of validation and guards.

##### API

```typescript
interface GoToOptions {
  skipValidation?: boolean;   // default: false — skip validation of the current step
  skipGuards?: boolean;       // default: false — skip checking the enabled guard on the target step
  skipLifecycle?: boolean;    // default: false — skip onLeave/onEnter
}

class WizardMachine<TData> {
  async goTo(stepId: StepId, options?: GoToOptions): Promise<boolean>;
}

// React hook
const { navigation } = useWizard({ ... });
navigation.goTo('personal');
navigation.goTo('personal', { skipValidation: true });
```

##### Behavior

1. If `skipValidation !== true` → run validation for the current step; if invalid — cancel navigation, return `false`
2. If `skipGuards !== true` → check `enabled` on the target step; if disabled — cancel, return `false`
3. If `skipLifecycle !== true` → call `onLeave` on the current step, `onEnter` on the target step
4. Add the current step to `navigationHistory` (WIZ-001)
5. Set `currentStepId = stepId`
6. Emit `onStateChange`

##### Constraints

- The target step **must** exist in `definition.steps` — otherwise throw a `WizardError`
- Cannot navigate to the current step (no-op, return `true`)

##### Tests

- goTo an existing step — transition succeeds
- goTo a non-existing step — error
- goTo with invalid current step and skipValidation=false — transition cancelled
- goTo a disabled step with skipGuards=false — transition cancelled
- goTo a disabled step with skipGuards=true — transition succeeds
- goTo calls onLeave/onEnter in the correct order
- goTo adds to navigationHistory

---

#### WIZ-003: Step Status Tracking

**Priority:** 🔴 Critical
**Effort:** S (3–4 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

To build navigation bars, progress bars, and sidebar navigation, you need to know the state of each step: whether it was visited, filled in, or has errors. Currently, the only information available is `currentStepId` and `enabled`. Developers have to manually track these states in a separate state object.

##### Solution

Automatic tracking of the status of each step in `WizardMachine`.

##### API

```typescript
type StepStatus =
  | "pristine"
  | "active"
  | "visited"
  | "completed"
  | "error"
  | "skipped";

// New in WizardState
interface WizardState<TData> {
  // ... existing
  stepStatuses: Record<StepId, StepStatus>;
}

// Methods for manual control (optional)
class WizardMachine<TData> {
  getStepStatus(stepId: StepId): StepStatus;
  setStepStatus(stepId: StepId, status: StepStatus): void; // for manual override
}
```

##### Automatic Status Transitions

```
pristine ──(step becomes currentStepId)──> active
active ──(goNext succeeds)──> completed
active ──(goNext with validation error)──> error
active ──(goPrevious / goTo departure)──> visited
completed ──(goTo back to step)──> active
error ──(goTo back to step)──> active
* ──(guard enabled=false)──> skipped
skipped ──(guard enabled=true)──> pristine
```

##### Initialization

When the machine is created, all steps receive the `pristine` status, except `initialStepId` → `active`. Steps with `enabled: false` → `skipped`.

##### Impact

- `stepStatuses` is added to `WizardState` — React/Vue receive it automatically
- Step status updates emit `onStateChange` (existing mechanism)

##### Tests

- Initial state: all pristine, except initial (active) and disabled (skipped)
- goNext: current → completed, next → active
- goNext with error: current → error, no transition
- goPrevious: current → visited, previous → active
- enabled dynamically becomes false → skipped
- enabled dynamically becomes true from skipped → pristine
- setStepStatus manual override works

---

#### WIZ-004: Progress API

**Priority:** 🟡 High
**Effort:** XS (1–2 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

To render a progress bar, the developer must manually calculate: how many steps there are in total (taking enabled into account), what index the current step is at, and what percentage has been completed. This is routine work that should live in the core.

##### Solution

Computed fields in `WizardState`, updated on every `onStateChange`.

##### API

```typescript
interface WizardProgress {
  totalSteps: number; // all steps in the definition
  enabledSteps: number; // steps with enabled !== false
  completedSteps: number; // steps with status 'completed'
  currentStepIndex: number; // 0-based index of current step among enabled steps
  enabledStepIds: StepId[]; // ordered list of enabled steps
  percentage: number; // 0–100, completedSteps / enabledSteps * 100
  isFirstStep: boolean; // currentStepIndex === 0
  isLastStep: boolean; // currentStepIndex === enabledSteps - 1
}

interface WizardState<TData> {
  // ... existing
  progress: WizardProgress;
}
```

##### Computing the Order of `enabledStepIds`

The order is determined by traversing the transition graph from `initialStepId` following `static` transitions and the first branch of `conditional` ones. For `resolver` transitions, the order cannot be computed statically — in that case, the order of keys from `Object.keys(definition.steps)` is used, filtered by enabled.

##### Dependencies

- Depends on WIZ-003 (Step Status Tracking) for `completedSteps`

##### Tests

- Linear wizard with 5 steps: totalSteps=5, enabledSteps=5, on step 3: currentStepIndex=2, percentage=40
- Wizard with 1 disabled step: enabledSteps is 1 less
- isFirstStep / isLastStep are correct
- Dynamically enabling/disabling a step updates progress

---

#### WIZ-005: Reset / Cancel

**Priority:** 🟡 High
**Effort:** XS (1–2 hours)
**Package:** `@gooonzick/wizard-core`, `@gooonzick/wizard-react`, `@gooonzick/wizard-vue`

##### Problem

There is no way to return the wizard to its initial state. If the user wants to "start over" or "cancel", the developer is forced to recreate the `WizardMachine`.

##### Solution

`reset()` and `cancel()` methods on `WizardMachine`.

##### API

```typescript
interface WizardConfig<TData> {
  // ... existing
  onCancel?: (data: TData) => void | Promise<void>;
}

class WizardMachine<TData> {
  reset(): void;
  // Returns the machine to initialStepId, resets data to initialData,
  // clears navigationHistory, resets stepStatuses to pristine.
  // Does NOT call onComplete.

  async cancel(): Promise<void>;
  // Calls onCancel(currentData), then reset().
  // If onCancel is not defined — just reset().
}

// React
const { actions } = useWizard({ ... });
actions.reset();
actions.cancel();

// Vue
const { actions } = useWizard({ ... });
actions.reset();
actions.cancel();
```

##### Behavior

**reset():**

1. Set `currentStepId = definition.initialStepId`
2. Set `data = structuredClone(initialData)` (deep clone)
3. Clear `navigationHistory = []`
4. Reset all `stepStatuses` to initial values (pristine / active / skipped)
5. Reset `validationErrors = null`
6. Emit `onStateChange`

**cancel():**

1. Call `onCancel(this.state.data)` — await if async
2. Call `reset()`

##### Important

- `initialData` must be saved as a snapshot (deep clone) when the machine is created — so that mutations to `data` do not affect the reset
- If `reset()` is called from `onLeave` of the current step — `onLeave` still executes, but `onEnter` of `initialStep` is called afterward

##### Tests

- reset() returns to initial step and data
- reset() clears history and statuses
- cancel() calls onCancel before reset
- cancel() without onCancel — just reset
- Mutations to data after reset do not affect initialData

---

### Tier 2 — Core Enhancements (Medium effort, High impact)

---

#### WIZ-006: State Persistence (Serialize / Restore)

**Priority:** 🟡 High
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

If the user reloads the page in the middle of a long wizard, all progress is lost. This is especially painful for enterprise wizards with 10+ steps that are mandatory to complete. None of the lightweight competitors handle this well (only `react-multistep` v6 via server-side sessions and XState via persist).

##### Solution

Serialization/deserialization of the full `WizardMachine` state into a JSON-compatible object.

##### API

```typescript
interface WizardSnapshot<TData> {
  version: number; // for migrations
  definitionId: string; // wizard definition.id
  currentStepId: StepId;
  data: TData;
  navigationHistory: StepId[];
  stepStatuses: Record<StepId, StepStatus>;
  timestamp: number; // Date.now() at the time of snapshot
}

class WizardMachine<TData> {
  serialize(): WizardSnapshot<TData>;
  // Creates a JSON-compatible snapshot of the current state.

  static restore<TData>(
    snapshot: WizardSnapshot<TData>,
    definition: WizardDefinition<TData>,
    context?: WizardContext,
    callbacks?: WizardCallbacks<TData>,
  ): WizardMachine<TData>;
  // Creates a WizardMachine from a snapshot.
  // Validates: definitionId matches, currentStepId exists in definition.
  // Throws WizardRestoreError if snapshot is invalid.
}

// Convenience: automatic persistence
interface WizardPersistenceAdapter {
  save(key: string, snapshot: WizardSnapshot<unknown>): void | Promise<void>;
  load(
    key: string,
  ): WizardSnapshot<unknown> | null | Promise<WizardSnapshot<unknown> | null>;
  clear(key: string): void | Promise<void>;
}

// Built-in adapters
function localStorageAdapter(): WizardPersistenceAdapter;
function sessionStorageAdapter(): WizardPersistenceAdapter;

// Usage in config
interface WizardConfig<TData> {
  persistence?: {
    adapter: WizardPersistenceAdapter;
    key: string; // storage key
    autoSave?: boolean; // save on every transition (default: true)
    debounceMs?: number; // debounce auto-save (default: 300)
  };
}
```

##### autoSave Behavior

If `persistence.autoSave === true`:

- After each `onStateChange` → `adapter.save(key, machine.serialize())`
- With debounce, so that rapid transitions don't spam the storage
- On machine creation → attempt `adapter.load(key)`; if snapshot is valid → restore, otherwise → fresh start

##### Validation on Restore

1. `snapshot.definitionId === definition.id` — otherwise error
2. `snapshot.currentStepId` exists in `definition.steps` — otherwise fallback to `initialStepId`
3. `snapshot.version` — reserved for future migrations

##### Security

- `serialize()` returns a plain object — the developer decides where to save it
- Not serialized: `context` (may contain API clients), callbacks, functions

##### Tests

- serialize → restore → state is identical
- restore with non-existing stepId → fallback to initialStepId
- restore with wrong definitionId → WizardRestoreError
- autoSave saves on every transition
- autoSave with debounce — single save during rapid transitions
- localStorageAdapter / sessionStorageAdapter CRUD

---

#### WIZ-007: Middleware / Plugin System

**Priority:** 🟡 High
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

Common cross-cutting concerns — analytics, auto-save, logging, error reporting — have to be implemented through lifecycle hooks in each step separately. There is no centralized mechanism for intercepting transitions.

##### Solution

A plugin system with hooks at the `WizardMachine` level, allowing global interception of all transitions.

##### API

```typescript
interface WizardPlugin<TData = unknown> {
  name: string;

  // Called when the machine is initialized
  onInit?: (machine: WizardMachineReadonly<TData>) => void | Promise<void>;

  // Before a transition. Can return false to cancel it.
  beforeTransition?: (
    event: TransitionEvent<TData>,
  ) => boolean | Promise<boolean>;

  // After a successful transition.
  afterTransition?: (event: TransitionEvent<TData>) => void | Promise<void>;

  // On error in any lifecycle hook or validation.
  onError?: (
    error: WizardError,
    context: ErrorContext<TData>,
  ) => void | Promise<void>;

  // When the wizard completes.
  onComplete?: (data: TData) => void | Promise<void>;

  // On reset/cancel.
  onReset?: () => void | Promise<void>;

  // On data update.
  onDataChange?: (prevData: TData, nextData: TData) => void | Promise<void>;

  // Cleanup when the machine is destroyed.
  destroy?: () => void | Promise<void>;
}

interface TransitionEvent<TData> {
  type: "next" | "previous" | "goTo";
  fromStepId: StepId;
  toStepId: StepId;
  data: TData;
  timestamp: number;
}

interface ErrorContext<TData> {
  stepId: StepId;
  phase: "validation" | "transition" | "lifecycle" | "submit";
  data: TData;
}

// Registration
class WizardMachine<TData> {
  use(plugin: WizardPlugin<TData>): void; // add plugin
  removePlugin(name: string): void; // remove by name
}

// Builder
createWizard<TData>("signup")
  .use(analyticsPlugin({ trackingId: "UA-XXX" }))
  .use(autoSavePlugin({ storage: localStorage, key: "signup" }))
  .use(loggingPlugin({ level: "debug" }))
  .build();
```

##### Execution Order

Plugins are executed in registration order:

1. Plugin A `beforeTransition` → Plugin B `beforeTransition` → ...
2. If any returned `false` → transition is cancelled, `afterTransition` is not called
3. Transition executes
4. Plugin A `afterTransition` → Plugin B `afterTransition` → ...

##### Built-in Plugins (future separate packages)

```typescript
// Example: analytics plugin
function createAnalyticsPlugin<TData>(config: {
  onStepView: (stepId: string, data: TData) => void;
  onStepComplete: (stepId: string, duration: number) => void;
  onWizardComplete: (data: TData, totalDuration: number) => void;
}): WizardPlugin<TData>;

// Example: auto-save plugin
function createAutoSavePlugin<TData>(config: {
  adapter: WizardPersistenceAdapter;
  key: string;
  debounceMs?: number;
}): WizardPlugin<TData>;

// Example: logging plugin
function createLoggingPlugin<TData>(config?: {
  level?: "debug" | "info" | "warn";
  logger?: Pick<Console, "log" | "warn" | "debug">;
}): WizardPlugin<TData>;
```

##### Tests

- Plugin beforeTransition is called before a transition
- Plugin beforeTransition returns false — transition cancelled
- Plugin afterTransition is called after a transition
- Multiple plugins execute in registration order
- onError is called on validation error
- removePlugin removes by name
- destroy is called when machine is destroyed

---

#### WIZ-008: Validate All Steps

**Priority:** 🟡 High
**Effort:** S (2–3 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

On the final "Summary / Review" step, you need to show an overview of which previous steps contain errors. Currently, the only option is to call `machine.validate()`, which only validates the current step. The developer has to manually iterate through steps and call their validators, which is unreliable and inelegant.

##### Solution

A `validateAll()` method that runs validators on all enabled steps and returns a summary.

##### API

```typescript
interface StepValidationSummary {
  stepId: StepId;
  valid: boolean;
  errors?: Record<string, string>;
}

interface ValidationSummary {
  valid: boolean;                              // whether all steps are valid
  steps: StepValidationSummary[];              // result for each step
  firstInvalidStepId: StepId | null;           // first invalid step (for goTo)
  invalidStepIds: StepId[];                    // all invalid steps
}

class WizardMachine<TData> {
  async validateAll(): Promise<ValidationSummary>;
}

// React
const { validation } = useWizard({ ... });
const summary = await validation.validateAll();
if (!summary.valid) {
  navigation.goTo(summary.firstInvalidStepId!, { skipValidation: true });
}
```

##### Behavior

1. Iterate through all steps in `definition.steps`
2. Skip steps with `enabled === false`
3. For each enabled step with `validate` — call `step.validate(data, context)`
4. Collect results
5. **Do not** change `stepStatuses` automatically (this is a dry-run)
6. Return `ValidationSummary`

##### Optional: Update stepStatuses

```typescript
async validateAll(options?: {
  updateStatuses?: boolean;  // default: false
}): Promise<ValidationSummary>;
```

If `updateStatuses: true` — set `error` for invalid steps.

##### Tests

- All steps valid → valid: true, invalidStepIds: []
- One step invalid → valid: false, firstInvalidStepId points to it
- Disabled steps are skipped
- Steps without validate → considered valid
- Async validators work
- updateStatuses: true updates stepStatuses

---

#### WIZ-009: Router Integration

**Priority:** 🟡 High
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-router-react` (new package)

##### Problem

When using a wizard in an SPA, each step should have its own URL to support:

- Browser "Back" button
- Deeplinks (link to a specific step)
- Refresh (page reload does not lose the current step)
- SEO (for public wizards)

Competitors `react-albus` and `@robo-wizard/react-router` solve this via React Router integration.

##### Solution

A separate package with two-way URL ↔ stepId synchronization.

##### API

```typescript
// @gooonzick/wizard-router-react

import { useRoutedWizard } from '@gooonzick/wizard-router-react';

function App() {
  const wizard = useRoutedWizard({
    definition: signupWizard,
    initialData: { ... },
    routing: {
      basePath: '/signup',               // URL prefix
      strategy: 'path',                  // 'path' | 'hash' | 'query'
      // path  → /signup/personal, /signup/plan
      // hash  → /signup#personal, /signup#plan
      // query → /signup?step=personal
      paramName: 'step',                 // for strategy: 'query'
      history: browserHistory,           // react-router history or window.history
    },
    onComplete: (data) => router.push('/dashboard'),
  });
}

// Or a wrapper for React Router v6+
import { WizardRoutes } from '@gooonzick/wizard-router-react';

<WizardRoutes
  definition={signupWizard}
  basePath="/signup"
  initialData={{ ... }}
>
  {({ state, navigation, actions }) => (
    <CurrentStepComponent
      data={state.data}
      onNext={() => navigation.goNext()}
    />
  )}
</WizardRoutes>
```

##### Synchronization

**URL → Machine:**

- On mount: read the current URL, extract stepId, call `goTo(stepId, { skipValidation: true })`
- On popstate (browser Back button): extract stepId, call `goPrevious()` or `goTo()`

**Machine → URL:**

- On every `onStateChange` → update URL via `history.pushState` or `history.replaceState`
- `goNext()` → `pushState`
- `goPrevious()` → `back()` or `pushState` (configurable)
- `goTo()` → `pushState`
- `reset()` → `replaceState` with initialStepId

##### Dependencies

- Depends on WIZ-002 (goTo)
- Optional peer dependency: `react-router-dom >= 6`

##### Tests

- URL updates on goNext
- Browser back → goPrevious
- Deeplink → goTo the correct step
- Refresh → current step is preserved
- Invalid stepId in URL → fallback to initialStep
- All three strategies (path / hash / query)

---

#### WIZ-010: onDataChange Event / Field-level Subscriptions

**Priority:** 🟠 Medium
**Effort:** S (2–3 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

Currently, `updateData` / `updateField` update the data, but there is no way to react to changes in specific fields without subscribing to the full `onStateChange`. This is needed for:

- Recalculating enabled steps when a specific field changes (e.g., `needsInvoice`)
- Auto-filling dependent fields
- Conditional validation

##### Solution

An `onDataChange` callback in config + a `watchField` method on the machine.

##### API

```typescript
interface WizardCallbacks<TData> {
  // ... existing
  onDataChange?: (
    prevData: TData,
    nextData: TData,
    changedFields: (keyof TData)[],
  ) => void;
}

class WizardMachine<TData> {
  watchField<K extends keyof TData>(
    field: K,
    callback: (newValue: TData[K], oldValue: TData[K]) => void,
  ): () => void; // returns unsubscribe
}
```

##### Determining changedFields

When `updateField(field, value)` is called → `changedFields = [field]`.
When `updateData(updater)` is called → shallow diff of keys between `prevData` and `nextData`.

##### Tests

- updateField calls onDataChange with the correct changedFields
- updateData calls onDataChange with the diff
- watchField calls callback only when the specific field changes
- watchField returns unsubscribe, which works

---

### Tier 3 — Strategic Features (High effort, Strategic impact)

---

#### WIZ-011: Sub-wizards (Nested Wizards)

**Priority:** 🟠 Medium
**Effort:** L (8–12 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

In enterprise scenarios, a wizard step may itself be a mini-wizard. For example: a main `Loan Application` wizard contains a `Documents` step, inside which there is a sub-wizard with steps `Passport → Tax ID → Income Statement → Confirmation`. When the sub-wizard completes, control returns to the parent.

Competitors: `use-wizard` supports nested paths, `xstate-wizards` — spawned actors, `SurveyJS` — multi-page forms inside a form.

##### Solution

A special step type `sub-wizard` that accepts a `WizardDefinition` and creates a child `WizardMachine` on entry.

##### API

```typescript
// In definition
const mainWizard: WizardDefinition<MainData> = {
  id: 'credit-application',
  steps: {
    personal: { /* ... */ },
    documents: {
      id: 'documents',
      type: 'sub-wizard',                      // new step type
      subWizard: {
        definition: documentsWizard,            // WizardDefinition<DocumentsData>
        mapDataIn: (parentData) => ({           // transform parent data → child
          applicantName: parentData.name,
        }),
        mapDataOut: (childData, parentData) => ({  // merge child data → parent
          ...parentData,
          documents: childData,
        }),
      },
      next: { type: 'static', to: 'summary' },
      previous: { type: 'static', to: 'personal' },
    },
    summary: { /* ... */ },
  },
};

// Builder
createWizard<MainData>('credit')
  .step('documents', (step) => {
    step.subWizard(documentsWizard, {
      mapDataIn: (parent) => ({ ... }),
      mapDataOut: (child, parent) => ({ ... }),
    });
  })
  .build();
```

##### Behavior

1. On `onEnter` of the `documents` step → create `childMachine = new WizardMachine(subWizard.definition, context, mapDataIn(parentData))`
2. `childMachine.onComplete` → call `mapDataOut(childData, parentData)`, update parent data, advance to the parent's `next` step
3. `childMachine.goPrevious()` on the first child step → return to the parent's `previous` step (exit the sub-wizard backwards)
4. Parent `goTo('documents')` → enter the sub-wizard at the first step

##### State

```typescript
interface WizardState<TData> {
  // ... existing
  activeSubWizard?: {
    stepId: StepId; // parent stepId containing the sub-wizard
    state: WizardState<unknown>; // state of the child wizard
  };
}
```

##### Progress

Sub-wizard steps contribute to the overall parent progress. One `documents` step counts as N steps of the child wizard.

##### Tests

- Entering a sub-wizard step creates a child machine
- Navigation within the child wizard works
- Child wizard completion → mapDataOut → goNext in parent
- goPrevious on first child step → exit the sub-wizard
- Progress accounts for child wizard steps
- Serialize/Restore saves child wizard state

---

#### WIZ-012: DevTools / Mermaid Export

**Priority:** 🟠 Medium
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-devtools` (new package)

##### Problem

For complex wizards with 10+ steps and conditional branching, it is difficult for a developer to visualize the transition graph. XState solves this with a visualizer (Stately). `gooonzick/wizard` has no visualization tool.

##### Solution

1. Export `WizardDefinition` to a Mermaid diagram (can be rendered in markdown, Notion, GitHub)
2. Export to DOT (Graphviz)
3. Optionally: a React component for runtime visualization

##### API

````typescript
// @gooonzick/wizard-devtools

import { toMermaid, toDot, WizardDevPanel } from '@gooonzick/wizard-devtools';

// Static export (from definition, no runtime)
const mermaid = toMermaid(signupWizard);
// Returns:
// ```
// stateDiagram-v2
//   [*] --> personal
//   personal --> plan
//   plan --> invoice : needsInvoice
//   plan --> summary : default
//   invoice --> summary
//   summary --> [*]
// ```

const dot = toDot(signupWizard);
// Returns a Graphviz DOT string

// Runtime visualizer (React component)
<WizardDevPanel machine={machine} position="bottom-right" />
// Shows:
// - Step graph with current step highlighted
// - stepStatuses by color (green=completed, blue=active, red=error, gray=pristine)
// - navigationHistory as a breadcrumb
// - Current data (collapsible JSON)
// - Validation errors
````

##### Mermaid Mapping

| Transition type  | Mermaid                                                         |
| ---------------- | --------------------------------------------------------------- |
| `static`         | `stepA --> stepB`                                               |
| `conditional`    | `stepA --> stepB : condition1` + `stepA --> stepC : condition2` |
| `resolver`       | `stepA --> stepB : [resolver]` (dashed)                         |
| `enabled: false` | Node is grey with dashed border                                 |

##### Tests

- Linear wizard → correct Mermaid diagram
- Conditional wizard → branches with labels
- Resolver → dashed lines
- Disabled steps → visually distinct
- WizardDevPanel renders without errors (snapshot test)

---

#### WIZ-013: Async Step Loading (Lazy Steps)

**Priority:** 🟢 Low
**Effort:** M (4–5 hours)
**Package:** `@gooonzick/wizard-core`

##### Problem

For large wizards (20+ steps), loading all step configurations at initialization slows down the initial load. Especially if steps contain heavy validation schemas (Zod/Valibot) or data.

##### Solution

Support for lazy-loading of step definitions.

##### API

```typescript
// In definition — lazy step
const wizard: WizardDefinition<Data> = {
  steps: {
    simple: { id: "simple" /* ... */ }, // regular step
    heavy: () => import("./steps/heavy").then((m) => m.default), // lazy step
  },
};

// Builder
createWizard<Data>("big-form")
  .step("simple", (s) => s.title("Simple"))
  .lazyStep("heavy", () => import("./steps/heavy"))
  .build();

// Machine state
interface WizardState<TData> {
  // ... existing
  isLoadingStep: boolean; // true while a lazy step is loading
}
```

##### Behavior

1. On transition to a lazy step → set `isLoadingStep: true`, emit `onStateChange`
2. Execute `import()` (or any Promise)
3. Cache the result (repeated navigation does not reload)
4. Set `isLoadingStep: false`, emit `onStateChange`
5. Execute the normal `onEnter`

##### Tests

- Lazy step loads on first navigation
- isLoadingStep true → false
- Repeated navigation does not reload
- Load error → onError
- Progress API works with lazy steps

---

#### WIZ-014: Svelte Integration

**Priority:** 🟢 Low
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-svelte` (new package)

##### Problem

Svelte is the third most popular framework, growing actively. The lack of integration limits the library's audience.

##### Solution

A Svelte store wrapper around `WizardMachine`.

##### API

```svelte
<script>
  import { createWizardStore } from '@gooonzick/wizard-svelte';

  const wizard = createWizardStore({
    definition: signupWizard,
    initialData: { ... },
    onComplete: (data) => goto('/done'),
  });

  // $wizard — reactive state
  // wizard.goNext(), wizard.goPrevious(), wizard.goTo(), etc.
</script>

<h2>{$wizard.currentStep.meta?.title}</h2>

{#if $wizard.currentStepId === 'personal'}
  <input bind:value={$wizard.data.name} />
{/if}

<button on:click={wizard.goNext} disabled={!$wizard.canGoNext}>
  Next
</button>
```

##### Implementation

- `createWizardStore` returns a Svelte `writable` store
- Internally creates a `WizardMachine` and subscribes to `onStateChange`
- Each `onStateChange` → `store.set(newState)`
- Navigation methods are available directly on the store object

##### Dependencies

- Peer dependency: `svelte >= 4`
- Dependency: `@gooonzick/wizard-core`

##### Tests

- Store reactively updates on transitions
- All navigation methods work
- Lifecycle hooks are called
- Svelte `$` syntax works

---

#### WIZ-015: Solid.js Integration

**Priority:** 🟢 Low
**Effort:** M (4–6 hours)
**Package:** `@gooonzick/wizard-solid` (new package)

##### Problem

Solid.js is a fast-growing framework, popular in the TanStack ecosystem. Solid is supported in TanStack Form, TanStack Router, and TanStack Query, which creates a natural audience.

##### Solution

A Solid.js primitive wrapper.

##### API

```tsx
import { createWizard } from '@gooonzick/wizard-solid';

function App() {
  const wizard = createWizard({
    definition: signupWizard,
    initialData: { ... },
    onComplete: (data) => navigate('/done'),
  });

  return (
    <div>
      <h2>{wizard.state.currentStep.meta?.title}</h2>

      <Show when={wizard.state.currentStepId === 'personal'}>
        <input
          value={wizard.state.data.name}
          onInput={(e) => wizard.actions.updateField('name', e.target.value)}
        />
      </Show>

      <button onClick={wizard.navigation.goNext} disabled={!wizard.navigation.canGoNext}>
        Next
      </button>
    </div>
  );
}
```

##### Implementation

- `createWizard` returns an object with `createSignal`-based state
- Internally: `WizardMachine` + `onStateChange` → `setSignal(newState)`
- Navigation/action methods are returned as regular functions

##### Dependencies

- Peer dependency: `solid-js >= 1.8`
- Dependency: `@gooonzick/wizard-core`

---

#### WIZ-016: Analytics Helpers

**Priority:** 🟢 Low
**Effort:** S (2–3 hours)
**Package:** `@gooonzick/wizard-core` (as a built-in plugin)

##### Problem

The wizard funnel is one of the key business metrics. How many users reached each step, how much time they spent on each, at which step they drop off, and how many go back. Currently, this all has to be collected manually.

##### Solution

A built-in analytics collector that automatically gathers data.

##### API

```typescript
import { createAnalyticsPlugin } from "@gooonzick/wizard-core/plugins";

const analytics = createAnalyticsPlugin<SignupData>({
  onStepView: (stepId, data) => {
    gtag("event", "wizard_step_view", { step: stepId });
  },
  onStepComplete: (stepId, durationMs) => {
    gtag("event", "wizard_step_complete", {
      step: stepId,
      duration: durationMs,
    });
  },
  onWizardComplete: (data, totalDurationMs) => {
    gtag("event", "wizard_complete", { duration: totalDurationMs });
  },
  onDropOff: (stepId, durationMs) => {
    // Called on destroy() if the wizard has not been completed
    gtag("event", "wizard_drop_off", { step: stepId, duration: durationMs });
  },
  onBacktrack: (fromStepId, toStepId) => {
    gtag("event", "wizard_backtrack", { from: fromStepId, to: toStepId });
  },
});

machine.use(analytics);

// Get summary
const report = analytics.getReport();
// {
//   startedAt: 1711234567890,
//   stepTimings: { personal: 12340, plan: 5230, ... },
//   backtrackCount: 2,
//   backtrackHistory: [{ from: 'plan', to: 'personal', at: ... }],
//   currentStep: 'summary',
//   completed: false,
//   totalDuration: 45230,
// }
```

##### Automatic Collection

The plugin automatically:

- Times each step (using `afterTransition` — start timer, `beforeTransition` — stop timer)
- Counts backtracks (transition to a step with a lower index than the current one)
- Records drop-off on `destroy()`
- Produces `getReport()` — aggregated statistics

##### Dependencies

- Depends on WIZ-007 (Plugin System)

##### Tests

- Step time is measured correctly
- Backtrack count increments on goPrevious
- onDropOff is called on destroy of an incomplete wizard
- getReport returns full statistics
- onWizardComplete is called on completion

---

## Appendix A: Implementation Order

```
Phase 1 (Foundation):
  WIZ-001 Navigation History  ─┐
  WIZ-003 Step Status          ├── In parallel, no dependencies
  WIZ-005 Reset / Cancel       ─┘

Phase 2 (Navigation):
  WIZ-002 goTo()               ── depends on WIZ-001
  WIZ-004 Progress API         ── depends on WIZ-003

Phase 3 (Ecosystem):
  WIZ-007 Plugin System        ── independent
  WIZ-006 Persistence          ── depends on WIZ-001, WIZ-003
  WIZ-008 Validate All         ── depends on WIZ-003

Phase 4 (Integrations):
  WIZ-009 Router               ── depends on WIZ-002
  WIZ-010 onDataChange         ── independent
  WIZ-016 Analytics Plugin     ── depends on WIZ-007

Phase 5 (Advanced):
  WIZ-011 Sub-wizards          ── depends on WIZ-001–WIZ-005
  WIZ-012 DevTools             ── depends on WIZ-003
  WIZ-013 Lazy Steps           ── independent
  WIZ-014 Svelte Integration   ── independent
  WIZ-015 Solid Integration    ── independent
```

## Appendix B: Breaking Changes Summary

| Task                | Breaking change                 | Mitigation                                  |
| ------------------- | ------------------------------- | ------------------------------------------- |
| WIZ-001 History     | `goPrevious()` changes behavior | `useHistory: boolean` option in config      |
| WIZ-003 Step Status | New field in `WizardState`      | Additive, non-breaking                      |
| WIZ-004 Progress    | New field in `WizardState`      | Additive, non-breaking                      |
| WIZ-005 Reset       | New methods                     | Additive, non-breaking                      |
| WIZ-006 Persistence | New methods + static            | Additive, non-breaking                      |
| WIZ-007 Plugins     | New `use()` method              | Additive, non-breaking                      |
| WIZ-011 Sub-wizards | New step type                   | Additive, non-breaking                      |
| WIZ-013 Lazy Steps  | Steps can be a function         | Requires `typeof step === 'function'` check |

**Recommendation:** combine Phase 1 + Phase 2 into a single minor release (v1.1.0), Phase 3 into v1.2.0, Phase 4 into v1.3.0, and Phase 5 into v2.0.0 (if there is a breaking change with `useHistory` enabled by default).
