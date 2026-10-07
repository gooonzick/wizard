---
title: Svelte Integration
description: How to use createWizardStore and the Svelte 5 runes API to integrate wizards into your Svelte application
---

# Svelte Integration Guide

This guide covers how to use `@gooonzick/wizard-svelte` to integrate wizards into your Svelte application, with either the classic store API or the Svelte 5 runes API.

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-svelte
```

### Which entry point?

The package ships **two layers**:

| Import specifier | Primitive | Requires |
| ---------------- | --------- | -------- |
| `@gooonzick/wizard-svelte` | classic store contract (`subscribe`) | Svelte 4 **or** 5 |
| `@gooonzick/wizard-svelte/runes` | Svelte 5 runes (`$state`) | Svelte 5 **only** |

`package.json` declares a single peer range, `"svelte": "^4.0.0 || ^5.0.0"`, because export
conditions cannot express a per-subpath peer. That range describes the **main entry**. The
`/runes` subpath ships uncompiled (`$state(...)` verbatim, packaged by `svelte-package` and
advertised through the `"svelte"` export condition), so it needs the Svelte 5 compiler in
your build and will not work under Svelte 4.

Both layers expose the same flat key set, the same slices, the same `actions`, and the same
navigation methods — only the reactivity primitive differs. You can mix them in one app;
each layer even uses its own context key so they cannot cross-contaminate.

## Basic Usage — store API

`createWizardStore()` connects a wizard definition to Svelte's store contract. The returned
object *is* a store (it has `subscribe`), so `$wizard` works in templates.

```svelte
<script lang="ts">
  import { createWizardStore } from "@gooonzick/wizard-svelte";
  import { createLinearWizard } from "@gooonzick/wizard-core";

  type SignupData = {
    name: string;
    email: string;
    plan: string;
  };

  const definition = createLinearWizard<SignupData>({
    id: "signup",
    steps: [
      { id: "personal", title: "Personal Info" },
      { id: "plan", title: "Plan" },
      { id: "summary", title: "Summary" },
    ],
  });

  const wizard = createWizardStore<SignupData>({
    definition,
    initialData: { name: "", email: "", plan: "" },
    onComplete: (data) => console.log("done", data),
  });

  // Field stores MUST be declared at the top level of <script> for `$name` to work.
  const name = wizard.field("name");
  const email = wizard.field("email");
</script>

<h2>{$wizard.currentStep.meta?.title}</h2>
<p>Step {$wizard.progress.currentStepIndex + 1} / {$wizard.progress.enabledSteps}</p>

{#if $wizard.currentStepId === "personal"}
  <input bind:value={$name} placeholder="Name" />
  <input bind:value={$email} placeholder="Email" />
{:else if $wizard.currentStepId === "summary"}
  <p>{$wizard.data.name} — {$wizard.data.email}</p>
{/if}

{#if $wizard.validationErrors?.name}
  <p class="error">{$wizard.validationErrors.name}</p>
{/if}

<button onclick={wizard.goPrevious} disabled={!$wizard.canGoPrevious}>Back</button>
<!-- On the last step goNext() completes the wizard. canGoNext is false there, so don't disable on it. -->
<button onclick={wizard.goNext} disabled={$wizard.isNavigating}>
  {$wizard.progress.isLastStep ? "Finish" : "Next"}
</button>
```

Svelte 4 users write `on:click={wizard.goNext}` instead of `onclick=`.

## Basic Usage — runes API

```svelte
<script lang="ts">
  import { createWizard } from "@gooonzick/wizard-svelte/runes";
  import { signupWizard, type SignupData } from "./wizard";

  const wizard = createWizard<SignupData>({
    definition: signupWizard,
    initialData: { name: "", email: "", plan: "" },
  });

  const name = wizard.field("name");
</script>

<h2>{wizard.currentStep.meta?.title}</h2>
<p>Step {wizard.progress.currentStepIndex + 1} / {wizard.progress.enabledSteps}</p>

<input bind:value={name.value} />

<button onclick={wizard.goPrevious} disabled={!wizard.canGoPrevious}>Back</button>
<button onclick={wizard.goNext} disabled={wizard.isNavigating}>
  {wizard.progress.isLastStep ? "Finish" : "Next"}
</button>
```

Every flat key is a getter over a `$state.raw` snapshot, so plain reads are reactive in
templates and in `$derived` without any `.value` ceremony on the wizard itself.

## The flat aggregate vs. the sub-stores

`$wizard` yields one flattened object, `WizardSnapshot<T>`, merged from four slices:

```typescript
// state slice
$wizard.currentStepId; // Current step ID
$wizard.currentStep; // Current step definition
$wizard.data; // Current wizard data
$wizard.isCompleted; // Has the wizard completed?
$wizard.stepStatuses; // Record<StepId, StepStatus>
$wizard.progress; // WizardProgress — totals, index, percentage

// validation slice
$wizard.isValid;
$wizard.validationErrors;

// navigation slice
$wizard.canGoNext;
$wizard.canGoPrevious;
$wizard.canGoBack; // true when the history stack has more than one entry
$wizard.isFirstStep;
$wizard.isLastStep;
$wizard.visitedSteps;
$wizard.availableSteps;
$wizard.stepHistory;

// loading slice
$wizard.isValidating;
$wizard.isSubmitting;
$wizard.isNavigating;
$wizard.isLoadingStep; // a lazy step's implementation is loading (see Lazy Steps)
```

The aggregate is subscribed to the manager's `"all"` channel, so it re-emits on *any*
change. When a component only cares about one channel, subscribe to the matching sub-store
instead and it will not be woken by unrelated notifies:

```svelte
<script lang="ts">
  const { navigation, loading } = wizard;
</script>

<!-- On the last step goNext() completes the wizard. canGoNext is false there, so don't disable on it. -->
<button onclick={wizard.goNext} disabled={$loading.isNavigating}>
  {$navigation.isLastStep ? "Finish" : "Next"}
</button>
```

The four sub-stores are `wizard.state`, `wizard.validation`, `wizard.navigation` and
`wizard.loading`. On the runes layer they are plain getters (`wizard.navigation.canGoNext`).

Need something even narrower? Compose with Svelte's own `derived()`:

```typescript
import { derived } from "svelte/store";

const percentage = derived(wizard.state, ($state) => $state.progress.percentage);
```

There are intentionally **no** granular `useWizardData`-style helpers: `derived()` plus the
four sub-stores already cover the ground that React and Vue need extra hooks for.

## Two-way binding: `wizard.field(key)`

`field(key)` returns a `Writable<T[K]>` (store layer) or a `{ get value, set value }` pair
(runes layer) for one **top-level** data field. Writes route straight through
`machine.updateField`, so the `Object.is` no-op guard and the authoritative
`changedFields = [field]` contract (WIZ-010) both survive.

```svelte
<script lang="ts">
  const name = wizard.field("name"); // Writable<string>
  const plan = wizard.field("plan");
</script>

<input bind:value={$name} />
<select bind:value={$plan}>
  <option value="basic">Basic</option>
  <option value="pro">Pro</option>
</select>
```

The reference is stable per key: `wizard.field("name") === wizard.field("name")`.

Field stores also react to changes made anywhere else — `actions.updateData`, `reset()`,
`restore()` — and stay quiet when an unrelated field changes.

### Why `bind:value={$wizard.data.name}` is not supported

Svelte compiles `bind:value={$store.a.b}` to "mutate the object in place, then call
`store.set(theSameObject)`". `machine.snapshot.data` is deliberately **not** frozen, so the
mutation would land — and it would bypass `updateData` / `updateField` entirely: no
`onDataChange`, no plugin hooks, no field watchers, no `recalculateSkippedStatuses()`, no
`onStateChange`. It would also require the aggregate to expose `set`, which is meaningless
(you cannot "set" `canGoNext`).

So the aggregate is a `Readable`, never a `Writable`, and the binding is a **compile error**
by design ("Cannot bind to a non-writable store"). Use `wizard.field(key)` or
`wizard.actions.*`.

The same rule applies on the runes layer: `wizard.data` comes from `$state.raw`, so
`wizard.data.name = "x"` is silently non-reactive *and* bypasses the machine.

## Navigation and actions

Navigation methods live directly on the wizard object, matching the shape the wizard was
specced with:

```typescript
await wizard.goNext(); // Go to next step (validates first)
await wizard.goPrevious(); // Go to previous step (pops from history)
await wizard.goTo("summary"); // Jump to a step (validates first)
await wizard.goTo("summary", { skipValidation: true });
await wizard.goBack(2); // deprecated — use goPrevious()
await wizard.goToStep("summary"); // deprecated — use goTo(stepId)
```

Everything else is under `wizard.actions`:

```typescript
// Update data
wizard.actions.updateData((data) => ({ ...data, name: "John" }));
wizard.actions.setData(completeData); // deep-clones its argument
wizard.actions.updateField("name", "John");

// Validation
await wizard.actions.validate(); // result lands on the validation slice
await wizard.actions.validateAll(); // dry-run every enabled step → ValidationSummary
await wizard.actions.validateAll({ updateStatuses: true });
await wizard.actions.canSubmit();
await wizard.actions.submit();

// Reset / Cancel
wizard.actions.reset(); // back to the initial step + initial data, fires onReset
wizard.actions.reset(newData); // rewind with replacement data
await wizard.actions.cancel(); // awaits onCancel, then resets

// Persistence
const snapshot = wizard.actions.serialize();
wizard.actions.restore(snapshot);

// Lazy steps — prefetch the implementation; never rejects (failures are reported by the navigation that needs the step)
wizard.actions.preloadStep("documents");
```

`reset` and `restore` return `void`, not `Promise<void>` — exact parity with the React
binding. They are dispatched fire-and-forget, but the rejection path is terminated: a
malformed snapshot raises `WizardRestoreError`, which is forwarded to your `onError`
callback instead of becoming an unhandled rejection.

Loading flags are owned by `WizardStateManager`, the same model React uses:
`validate` / `validateAll` toggle `isValidating`, `submit` toggles `isSubmitting`, every
navigation method toggles `isNavigating`, and `reset` / `cancel` / `restore` run through
`manager.runReset` / `runCancel` / `runRestore` so `wizard.loading` stays accurate for them
too.

`isLoadingStep` is the one loading flag the manager does not track: it mirrors the machine's `isLoadingStep` (`true` while a lazy step's implementation loads) and is never set by `actions.preloadStep`, which never rejects. See [Lazy Steps](./defining-wizards.md#lazy-steps).

## Options

```typescript
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

  /** Registered once at machine creation — NOT reactive. */
  plugins?: WizardPlugin<T>[];

  /** Default `true`: register `onDestroy(() => void wizard.destroy())`. */
  autoDestroy?: boolean;
}
```

`CreateWizardOptions<T>` on the runes layer is identical.

Everything here is captured **at creation**. Mutating the options object afterwards has no
effect; recreate the wizard to reconfigure it.

## Lifecycle: `autoDestroy` and `destroy()`

The machine's lifetime is bound to `createWizardStore()` … `destroy()` — never to the
subscriber count. This matters more in Svelte than elsewhere: the obvious implementation
(`readable(value, start)`) runs its `stop` callback when the **last** subscriber leaves, so
an `{#if}` toggle, an HMR swap, or a component that only touches the store inside an event
handler would tear the wizard down and lose all progress. This package uses a hand-rolled
store that opens its manager subscription once and releases it only in `destroy()`.

With the default `autoDestroy: true`, the wizard registers `onDestroy(() => void
wizard.destroy())` during component initialisation, so unmounting the creating component
tears down plugins for you. The registration is wrapped in try/catch, so calling
`createWizardStore()` **outside** a component (a module, a `load` function, a test) is fully
supported — Svelte's `lifecycle_outside_component` error is swallowed and you own
`destroy()`:

```typescript
const wizard = createWizardStore({ definition, initialData, autoDestroy: false });
// ... later
await wizard.destroy();
```

`destroy()` is idempotent and safe to fire-and-forget (`void wizard.destroy()`), which is
what the `onDestroy` registration does because Svelte's `onDestroy` is synchronous-only.
Plugin `destroy()` hooks are async and their rejections are isolated inside the plugin host.

## Sharing a wizard through context

```svelte
<!-- WizardParent.svelte -->
<script lang="ts">
  import { createWizardStore, setWizardContext } from "@gooonzick/wizard-svelte";
  import { signupWizard, type SignupData } from "./wizard";
  import WizardChild from "./WizardChild.svelte";

  const wizard = setWizardContext(
    createWizardStore<SignupData>({
      definition: signupWizard,
      initialData: { name: "", email: "", plan: "" },
    }),
  );
</script>

<WizardChild />
```

```svelte
<!-- WizardChild.svelte -->
<script lang="ts">
  import { getWizardContext } from "@gooonzick/wizard-svelte";
  import type { SignupData } from "./wizard";

  const wizard = getWizardContext<SignupData>();
  const name = wizard.field("name");
</script>

<span>{$wizard.currentStepId}</span>
<input bind:value={$name} />
```

- `setWizardContext(wizard)` must be called during component initialisation and returns the
  same wizard, so it composes with `createWizardStore()` in one expression.
- `getWizardContext<T>()` throws a descriptive `Error` when no ancestor published a wizard.
- `hasWizardContext()` is a non-throwing probe — it returns `false` outside component
  initialisation instead of throwing (Svelte 5's `hasContext` throws there).

The runes layer exports the same three helpers from `@gooonzick/wizard-svelte/runes`, keyed
on a **distinct symbol**.

## Plugins

Plugins are passed once at creation and follow the framework-agnostic
[plugin contract](/guide/plugins):

```svelte
<script lang="ts">
  import { createWizardStore } from "@gooonzick/wizard-svelte";
  import { createLoggingPlugin } from "@gooonzick/wizard-core/plugins";

  // Define plugins outside the component (or hoist them) — the array is read once.
  const plugins = [createLoggingPlugin({ level: "debug" })];

  const wizard = createWizardStore({ definition, initialData, plugins });
</script>
```

A plugin whose `beforeTransition` returns `false` vetoes the navigation, and the binding
respects that completely: `currentStepId`, `stepHistory`, `visitedSteps` and `stepStatuses`
are all mutated inside the machine *after* the veto check, never by the Svelte layer.

Two plugins sharing a `name` raise `WizardConfigurationError` from `createWizardStore()`.

### Persisting progress

Use `createPersistencePlugin` — it works identically in Svelte:

```typescript
import { createPersistencePlugin, localStorageAdapter } from "@gooonzick/wizard-core/plugins";

const plugins = [
  createPersistencePlugin({
    adapter: localStorageAdapter(`wizard:${definition.id}`),
    debounceMs: 300,
  }),
];
```

See the [Plugins guide](/guide/plugins#built-in-plugin-createpersistenceplugin) for the full
contract.

## Behaviours worth knowing

### Navigation flags: a synchronous seed, then the async result

`canGoNext` and `isLastStep` are correct on first paint for synchronous graphs.
`WizardStateManager` seeds them from core's `progress.isLastStep` when the wizard is created,
and re-seeds them whenever the current step changes. The seed is conservative: `isLastStep`
is `true` only when the forward path is definitely terminal, so a step whose `next` is an
async resolver (or leads through an async guard) starts as "not last" until the async result
arrives.

The authoritative values land once `getNextStepId()` / `getPreviousStepId()` /
`getAvailableSteps()` resolve, one microtask later. Until then `canGoPrevious` is `false` and
`availableSteps` is empty on the first snapshot; after a step change they keep their previous
values. The behaviour is identical in React, Vue and Solid.

In tests, await a macrotask before asserting `canGoPrevious`, `availableSteps`, or anything
only an async resolver can decide:

```typescript
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const wizard = createWizardStore({ definition, initialData });
expect(get(wizard).canGoNext).toBe(true); // seeded synchronously
await flush();
expect(get(wizard).availableSteps.length).toBeGreaterThan(0);
```

### `updateField` is a no-op on equal values

`machine.updateField` short-circuits when `Object.is(prev[field], value)`. No state change,
no `onDataChange`, no emission. A `field()` store's `set` therefore does not always emit.

### `restore()` emits twice

The machine writes the restored state synchronously and then fires a fire-and-forget
`validate()`, producing a second, asynchronous emission. Never assume one emission per
restore.

### `$` auto-subscription only works at the top level of `<script>`

`const name = wizard.field("name")` inside an `{#each}` body or inside a function will not
get the `$name` sugar — that is a Svelte compiler rule, not a library limitation. Declare
field stores at the top level, or subscribe manually.

## SSR and SvelteKit

- **Never create a wizard at module scope.** One machine would be shared across every SSR
  request, leaking one user's data into another's response. Create it inside component
  initialisation, or per `load` call.
- `onDestroy` **does** run during SSR in Svelte, and `destroy()` is safe on a machine that
  never navigated, so the default `autoDestroy` behaviour is correct on the server too.
- `getContext` / `setContext` are SSR-safe.
- The binding never touches `window` or `document`. Browser-only plugins such as
  `localStorageAdapter` resolve their globals lazily and are SSR-safe by design.

## Svelte 4 vs Svelte 5

| | Svelte 4 | Svelte 5 |
| --- | --- | --- |
| Store entry (`@gooonzick/wizard-svelte`) | ✅ | ✅ |
| Runes entry (`/runes`) | ❌ | ✅ |
| Event handlers | `on:click={wizard.goNext}` | `onclick={wizard.goNext}` |
| Store → rune interop | — | `fromStore(wizard)` |

Svelte 5's `fromStore()` gives rune ergonomics without switching entry points:

```svelte
<script lang="ts">
  import { fromStore } from "svelte/store";

  const wizard = createWizardStore<SignupData>({ definition, initialData });
  const snapshot = fromStore(wizard);
</script>

<h2>{snapshot.current.currentStepId}</h2>
```

`fromStore` / `toStore` are Svelte 5 only; this package never imports them at runtime, which
is what keeps the store layer compatible with Svelte 4.

## Troubleshooting

### `$state is not defined` at runtime

Your bundler pre-bundled the `/runes` subpath **without** running the Svelte compiler. The
package advertises the `"svelte"` export condition so `@sveltejs/vite-plugin-svelte`
auto-detects it, but a linked workspace copy or an aggressive dependency optimizer can still
slip through. Exclude the package from dependency pre-bundling:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [svelte()],
  optimizeDeps: { exclude: ["@gooonzick/wizard-svelte"] },
});
```

### "Cannot bind to a non-writable store"

You wrote `bind:value={$wizard.something}`. That is intentional — see
[Why `bind:value={$wizard.data.name}` is not supported](#why-bindvaluewizarddataname-is-not-supported).
Use `wizard.field(key)`.

### The Next button starts disabled and only enables a tick later

Expected — see [The first navigation snapshot is optimistically wrong](#the-first-navigation-snapshot-is-optimistically-wrong).

### The wizard resets when a block unmounts

It should not — lifetime is bound to `destroy()`, not to subscriber count. If it does, check
that you are not recreating the wizard inside a block that re-runs (e.g. inside `{#key}`),
and that nothing calls `destroy()` early.

### Data does not update

You are probably mutating `$wizard.data` (store layer) or `wizard.data` (runes layer)
directly. Both bypass the machine. Use `wizard.field(key)`, `actions.updateField`,
`actions.updateData` or `actions.setData`.

## Related Documentation

- [Svelte API reference](./api/svelte.md)
- [Core Concepts](./core-concepts.md)
- [Defining Wizards](./defining-wizards.md)
- [Plugins](./plugins.md)
