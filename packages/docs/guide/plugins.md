---
title: Plugins
description: Intercept wizard transitions and lifecycle events globally with the plugin system
---

# Plugins

Plugins let you intercept wizard transitions and lifecycle events globally, across every step — ideal for analytics, logging, error reporting, and auto-save. A plugin is a plain object implementing the `WizardPlugin` interface; you register instances on the machine.

> `onDataChange(prevData, nextData, changedFields)` is part of the plugin interface (WIZ-010). It fires after any data mutation (`updateField` / `updateData` / `setData`) that changes at least one top-level field, with `DeepReadonly` data payloads. It is fire-and-forget (may be async) and isolated — a throw or rejection is routed to `onError` with `phase: "data"`.

## The `WizardPlugin` Interface

```ts
import type { WizardPlugin } from "@gooonzick/wizard-core";

interface WizardPlugin<TData = unknown> {
  name: string; // unique; used by removePlugin

  onInit?(machine: WizardMachineReadonly<TData>): void | Promise<void>;

  /** Return `false` to veto the transition (silent cancel, no error thrown). */
  beforeTransition?(
    e: TransitionEvent<TData>,
  ): boolean | undefined | Promise<boolean | undefined>;

  afterTransition?(e: TransitionEvent<TData>): void | Promise<void>;

  onError?(
    error: WizardError | Error,
    ctx: ErrorContext<TData>,
  ): void | Promise<void>;

  onComplete?(data: DeepReadonly<TData>): void | Promise<void>;

  onReset?(): void | Promise<void>;

  /** Fired after a data mutation that changed at least one top-level field. */
  onDataChange?(
    prevData: DeepReadonly<TData>,
    nextData: DeepReadonly<TData>,
    changedFields: readonly (keyof TData)[],
  ): void | Promise<void>;

  destroy?(): void | Promise<void>;
}
```

Hook payloads (`data`, `snapshot`, `currentStep`) are typed `DeepReadonly<T>`: TypeScript prevents mutation at compile time. These are the machine's **live references** — they are never cloned at runtime.

### Supporting Types

```ts
/** Payload passed to beforeTransition / afterTransition. */
interface TransitionEvent<TData> {
  type: "next" | "previous" | "goTo";
  fromStepId: StepId;
  toStepId: StepId;
  data: DeepReadonly<TData>;
  timestamp: number;
}

/** Context passed to a plugin's onError hook. */
interface ErrorContext<TData> {
  stepId: StepId;
  phase: "validation" | "transition" | "lifecycle" | "submit" | "data";
  data: DeepReadonly<TData>;
}

/** Read-only machine view passed to onInit. */
interface WizardMachineReadonly<TData> {
  readonly snapshot: DeepReadonly<WizardState<TData>>;
  readonly currentStep: DeepReadonly<WizardStepDefinition<TData>>;
  getStepStatus(stepId: StepId): StepStatus;
}
```

---

## Registering Plugins

### Machine-level API

```ts
// Register at construction time (5th positional argument):
const machine = new WizardMachine(definition, context, initialData, events, [
  myPlugin,
  anotherPlugin,
]);

// Register after construction (chainable; throws WizardConfigurationError on duplicate name):
machine.use(analyticsPlugin).use(loggingPlugin);

// Remove by name (awaits that plugin's destroy(), then drops it):
await machine.removePlugin("analytics");

// Tear down all plugins (reverse registration order):
await machine.destroy();
```

### React

Pass the `plugins` option to `useWizard` or `<WizardProvider>`. The array is read **once at machine creation** and is not reactive — define it outside the render function or wrap it in `useMemo`.

```tsx
import { createLoggingPlugin } from "@gooonzick/wizard-core";

// Define outside the component (or useMemo):
const plugins = [createLoggingPlugin({ level: "debug" })];

function MyWizard() {
  const { state, navigation } = useWizard({
    definition,
    initialData,
    plugins,
  });
  // ...
}
```

Plugins are automatically destroyed (`machine.destroy()`) when the component unmounts.

#### With WizardProvider

```tsx
const plugins = [createLoggingPlugin()];

function App() {
  return (
    <WizardProvider definition={definition} initialData={initialData} plugins={plugins}>
      <MyWizardSteps />
    </WizardProvider>
  );
}
```

### Vue

Pass the `plugins` option to `useWizard` or `<WizardProvider>`. Captured once at composable setup — not reactive.

```ts
import { createLoggingPlugin } from "@gooonzick/wizard-core";

// Define outside setup or as a module-level constant:
const plugins = [createLoggingPlugin({ level: "info" })];

export default defineComponent({
  setup() {
    const { state, navigation } = useWizard({
      definition,
      initialData,
      plugins,
    });
    return { state, navigation };
  },
});
```

Plugins are automatically destroyed via `onScopeDispose` when the component scope is disposed.

---

## Hook Reference

| Hook | When it fires | Can veto? | Error handling |
|---|---|---|---|
| `onInit` | After machine state is seeded (fire-and-forget) | No | Isolated — logged, does not throw to callers |
| `beforeTransition` | Before every `goNext` / `goPrevious` / `goTo` (incl. `skipLifecycle`, and the deprecated `goBack` / `goToStep` aliases) | **Yes** — return `false` | Sequential — a throw aborts the transition and rethrows to the caller (`goNext`/`goPrevious`/`goTo` reject); reported once via `onError` with phase `"transition"` |
| `afterTransition` | After the transition succeeds | No | Isolated |
| `onError` | When any hook or validation throws | No | Single reporter — fires **exactly once** per failure |
| `onComplete` | When the wizard completes | No | Isolated |
| `onReset` | When the wizard resets or cancels | No | Isolated |
| `destroy` | When the machine or plugin is torn down | No | Isolated |

### Firing Order

When multiple plugins are registered, hooks fire in **registration order** (the order passed to the constructor array or the order of `use()` calls). The exception is `destroy`, which fires in **reverse** registration order for symmetric teardown.

For a single transition with two plugins A and B:

```
A.beforeTransition → B.beforeTransition
  ↓ (if neither returned false)
[transition executes]
  ↓
A.afterTransition → B.afterTransition
```

### The `skipLifecycle` Rule

`before/afterTransition` fire on **all** navigation calls — including `goTo` with `skipLifecycle: true`. The `skipLifecycle` flag controls only step-level lifecycle hooks (`onEnter` / `onLeave`), not plugin hooks. Plugins always observe every navigation event.

### Veto Semantics

If `beforeTransition` returns `false`, the transition is **silently cancelled** — no error is thrown, no `afterTransition` fires. A veto is a clean no-op: the wizard's current step, navigation history, and **all step statuses** are left completely unchanged (the veto is checked before any `onLeave`, history, or status mutation, so nothing is partially applied). This holds for every navigation method — `goNext`, `goTo`, `goPrevious`, and `goBack`. Note that the navigation method still resolves normally: `await goTo(...)` (and `goNext`/`goPrevious`/`goBack`) returns `Promise<void>` and resolves rather than rejects on a veto, so callers awaiting the call will not see a rejection.

**A veto guards navigation, not prior side effects.** `beforeTransition` is a *navigation gate*, not a pre-`onSubmit` gate. On `goNext` it fires **after** the current step's `validate()` and `onSubmit` have already run; on `goTo` it fires after the current step has been validated (unless you pass `skipValidation: true`). So while a veto reliably keeps the wizard on the current step (history, current step, and statuses stay put), it does **not** undo a `validate()` pass or an `onSubmit` that already executed. Put logic that must run *before* submit into the step's own `onSubmit`/validation, and use `beforeTransition` for cross-cutting navigation guards.

### Error Semantics — Exactly Once

Each error is reported to plugins **exactly once** regardless of where it originates. When a thrown error is first caught (e.g., inside a validator), `onError` fires immediately. The calling method (e.g., `goNext`) does not re-report the same error so your plugin's `onError` will not be called twice for the same failure.

Plugin hook errors themselves are **isolated**: if your plugin's `onComplete` throws, the error is routed through `onError` at phase `"lifecycle"` and does not propagate to the calling code.

### Re-entrancy / Busy Guard

While any navigation (`goNext`, `goPrevious`, `goTo`) is in progress, the machine holds a busy lock. Attempting to call another navigation method from inside a plugin hook (e.g., calling `goNext()` inside `afterTransition`) throws a `WizardNavigationError` with `reason: "busy"`. Design plugins to be pure observers rather than initiators of navigation.

### `onInit` Fire-and-Forget

`onInit` is dispatched fire-and-forget: the machine does not await it before the first user interaction. Plugins must not assume `onInit` has fully completed before their first `beforeTransition` fires.

---

## Import Paths

All plugin types, `createLoggingPlugin`, and `createAnalyticsPlugin` are available from both the main barrel and a dedicated subpath:

```ts
// Main barrel — works for most cases:
import { createLoggingPlugin, createAnalyticsPlugin } from "@gooonzick/wizard-core";
import type { WizardPlugin, TransitionEvent, ErrorContext } from "@gooonzick/wizard-core";

// Dedicated subpath — useful for tree-shaking or plugin-only bundles:
import { createLoggingPlugin, createAnalyticsPlugin } from "@gooonzick/wizard-core/plugins";
import type {
  WizardPlugin,
  TransitionEvent,
  ErrorContext,
  WizardMachineReadonly,
  DeepReadonly,
  AnalyticsReport,
  BacktrackEntry,
  AnalyticsPluginConfig,
  AnalyticsPlugin,
} from "@gooonzick/wizard-core/plugins";
```

---

## Built-in Plugin: `createLoggingPlugin`

The logging plugin is a reference implementation that logs every hook to the console (or a custom logger). It never vetoes and never throws.

```ts
import { createLoggingPlugin } from "@gooonzick/wizard-core";

const logger = createLoggingPlugin({
  level: "debug", // "debug" | "info" | "warn" — default: "debug"
  logger: console, // any { log, warn, debug } object — default: console
});
```

**Log levels:**
- `"debug"` — logs everything via `logger.debug`
- `"info"` — logs via `logger.log`, suppresses verbose lines
- `"warn"` — only logs errors via `logger.warn`, suppresses all verbose output

**React example:**

```tsx
const plugins = [
  createLoggingPlugin<MyData>({ level: "info" }),
];

function MyWizard() {
  const { state } = useWizard({ definition, initialData, plugins });
  // ...
}
```

---

## Built-in Plugin: `createAnalyticsPlugin`

The analytics plugin is a second built-in. It automatically times each step, counts
backward navigations ("backtracks"), records drop-off on teardown, and fires optional
callbacks. Unlike `createLoggingPlugin`, the returned instance exposes a synchronous
`getReport()` method for reading aggregated metrics at any time. It never vetoes.

```ts
import { createAnalyticsPlugin } from "@gooonzick/wizard-core";
// or: import { createAnalyticsPlugin } from "@gooonzick/wizard-core/plugins";

const analytics = createAnalyticsPlugin<SignupData>({
  onStepView: (stepId, data) => track("step_view", { stepId }),
  onStepComplete: (stepId, durationMs) => track("step_complete", { stepId, durationMs }),
  onBacktrack: (from, to) => track("backtrack", { from, to }),
  onWizardComplete: (data, totalDurationMs) => track("wizard_complete", { totalDurationMs }),
  onDropOff: (stepId, durationMs) => track("drop_off", { stepId, durationMs }),
  // now: () => Date.now(), // injectable clock; defaults to Date.now
});

machine.use(analytics);

// Read aggregates at any time — includes the current step's live open-visit time:
const report = analytics.getReport();
```

### Config

All callbacks are optional; pass only what you need.

| Option | Signature | When it fires |
|---|---|---|
| `onStepView` | `(stepId, data) => void` | On init and on every step entered (including backtracks). |
| `onStepComplete` | `(stepId, durationMs) => void` | When a step is **left** — on each transition for the departing step, and on completion for the terminal step. |
| `onBacktrack` | `(fromStepId, toStepId) => void` | On a `previous` transition, or a `goTo` targeting an already-viewed step. |
| `onWizardComplete` | `(data, totalDurationMs) => void` | When the wizard completes. |
| `onDropOff` | `(stepId, durationMs) => void` | On teardown (`destroy`) **only if the wizard never completed**. |
| `now` | `() => number` | Injectable clock used for all timing. Defaults to `Date.now`. |

### `getReport()`

`analytics.getReport()` returns a snapshot of type `AnalyticsReport`:

```ts
interface AnalyticsReport {
  startedAt: number;                       // now() at session start (onInit / first hook / last reset)
  stepTimings: Record<StepId, number>;     // accumulated ms per step, INCLUDING the current live visit
  backtrackCount: number;                  // number of backward navigations this session
  backtrackHistory: BacktrackEntry[];      // ordered list of { from, to, at }
  currentStep: StepId | null;              // most recently entered step, or null before any step
  completed: boolean;                      // true once onWizardComplete fired (reset clears it)
  totalDuration: number;                   // completed ? completedAt - startedAt : now() - startedAt
}

interface BacktrackEntry {
  from: StepId;
  to: StepId;
  at: number;
}
```

### Semantics

- **Step timers.** Each step's open visit accumulates elapsed time. A step's timer
  closes on `afterTransition` (when you leave it); the final step's timer closes in
  `onComplete`. `getReport()` folds the current step's still-open visit into
  `stepTimings` and into `totalDuration`, so metrics are always live.
- **Backtracks.** A backtrack is any `previous` transition, or a `goTo` to a step you
  have already visited this session.
- **Drop-off.** `onDropOff` fires from `destroy()` **only if** the wizard was never
  completed — completed wizards never drop off. In React/Vue this happens automatically
  on unmount.
- **Injectable clock.** All durations use `config.now` (default `Date.now`), not the
  transition `timestamp`, so tests can inject a deterministic clock.
- **Throw-safe.** The plugin updates its internal bookkeeping *before* invoking your
  callbacks, so a throwing callback can never corrupt the report.
- **Reset.** Resetting the wizard restarts the analytics session in place (timings,
  backtracks, and `completed` are cleared and the initial step's timer restarts). Reset
  does **not** re-emit `onStepView`.

**React example:**

```tsx
import { useMemo } from "react";
import { createAnalyticsPlugin } from "@gooonzick/wizard-core";

function MyWizard() {
  const analytics = useMemo(
    () => createAnalyticsPlugin<MyData>({
      onStepComplete: (stepId, ms) => console.log(stepId, "took", ms, "ms"),
    }),
    [],
  );
  const plugins = useMemo(() => [analytics], [analytics]);

  const { state } = useWizard({ definition, initialData, plugins });

  // Read live aggregates whenever you need them:
  const onShowReport = () => console.log(analytics.getReport());
  // ...
}
```

---

## Writing Your Own Plugin

A plugin is a plain object with a `name` and any subset of the optional hooks. (For
built-in analytics use `createAnalyticsPlugin` above; the example below shows how you
would build a custom tracking plugin from scratch.) Here is a minimal tracking
plugin:

```ts
import type { WizardPlugin, TransitionEvent, DeepReadonly } from "@gooonzick/wizard-core";

interface TrackingConfig {
  track: (event: string, props?: Record<string, unknown>) => void;
}

function createTrackingPlugin<TData>(
  config: TrackingConfig,
): WizardPlugin<TData> {
  return {
    name: "tracking",

    onInit(machine) {
      config.track("wizard_init", {
        step: machine.snapshot.currentStepId,
      });
    },

    afterTransition(e: TransitionEvent<TData>) {
      config.track("wizard_step_change", {
        type: e.type,
        from: e.fromStepId,
        to: e.toStepId,
      });
    },

    onComplete(data: DeepReadonly<TData>) {
      config.track("wizard_complete");
    },

    onError(error, ctx) {
      config.track("wizard_error", {
        phase: ctx.phase,
        step: ctx.stepId,
        message: error.message,
      });
    },

    destroy() {
      // Release any subscriptions or timers here.
    },
  };
}
```

**Register it:**

```ts
const machine = new WizardMachine(definition, context, initialData, events, [
  createTrackingPlugin({ track: myAnalyticsLib.track }),
  createLoggingPlugin({ level: "warn" }),
]);
```

Or with React:

```tsx
const plugins = useMemo(
  () => [createTrackingPlugin({ track: myAnalyticsLib.track })],
  [],
);

const { state } = useWizard({ definition, initialData, plugins });
```

### Plugin Checklist

- Give your plugin a unique `name` — duplicate names throw `WizardConfigurationError`.
- All hooks are optional; implement only what you need.
- Never mutate the `data`, `snapshot`, or `currentStep` payloads — they are typed `DeepReadonly<T>`.
- Do not call navigation methods (`goNext`, `goTo`, etc.) from inside a hook — the machine is busy and the call will throw.
- Clean up timers, subscriptions, and external state in `destroy`.
- If your plugin is async, make sure rejected promises do not escape — the machine isolates hook errors but a top-level unhandled rejection still reaches the runtime.
