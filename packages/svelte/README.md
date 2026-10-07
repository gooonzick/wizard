# @gooonzick/wizard-svelte

Svelte integration for the Wizard framework — a classic store API and a Svelte 5 runes API in one package.

## Features

- **Two layers, one package** - `@gooonzick/wizard-svelte` (stores) and `@gooonzick/wizard-svelte/runes` (Svelte 5 runes)
- **Flat reactive aggregate** - `$wizard.currentStepId`, `$wizard.canGoNext`, `$wizard.progress`, …
- **Per-channel sub-stores** - `wizard.state`, `wizard.validation`, `wizard.navigation`, `wizard.loading` for fine-grained subscriptions
- **Safe two-way binding** - `wizard.field('name')` is a `Writable` routed through `machine.updateField`
- **Context helpers** - `setWizardContext` / `getWizardContext` / `hasWizardContext`
- **Lifecycle-safe** - the machine lives from `createWizardStore()` to `destroy()`, never tied to subscriber count
- **Full Type Safety** - TypeScript generics for your data types

## Installation

```bash
npm install @gooonzick/wizard-svelte @gooonzick/wizard-core
# or
pnpm add @gooonzick/wizard-svelte @gooonzick/wizard-core
# or
yarn add @gooonzick/wizard-svelte @gooonzick/wizard-core
```

### Svelte version support

The package declares `"svelte": "^4.0.0 || ^5.0.0"` as a peer dependency, but that range
only describes the **main entry** (the store layer). Export conditions cannot express a
per-subpath peer range, so it is documented here instead:

| Import specifier | Primitive | Requires |
| ---------------- | --------- | -------- |
| `@gooonzick/wizard-svelte` | classic store contract (`subscribe`) | Svelte 4 **or** 5 |
| `@gooonzick/wizard-svelte/runes` | Svelte 5 runes (`$state`) | Svelte 5 **only** |

The `/runes` subpath ships **uncompiled** (`$state(...)` verbatim, packaged by
`svelte-package`) and is advertised via the `"svelte"` export condition, so it needs the
Svelte 5 compiler in your build. Importing it under Svelte 4 will not work.

> CI exercises Svelte 5 only (`@sveltejs/vite-plugin-svelte@7` pins its peer to Svelte 5).
> Svelte 4 compatibility of the store layer is guaranteed by import-surface discipline —
> the runtime imports are limited to `onDestroy`, `getContext`, `setContext`, `hasContext`
> and the structural store contract, all unchanged since Svelte 3.

## Quick Start

### Store API (Svelte 4 + 5)

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
</script>

<h2>{$wizard.currentStep.meta?.title}</h2>
<p>Step {$wizard.progress.currentStepIndex + 1} / {$wizard.progress.enabledSteps}</p>

{#if $wizard.currentStepId === "personal"}
  <input bind:value={$name} />
{/if}

<button onclick={wizard.goPrevious} disabled={!$wizard.canGoPrevious}>Back</button>
<!-- On the last step goNext() completes the wizard. canGoNext is false there, so don't disable on it. -->
<button onclick={wizard.goNext} disabled={$wizard.isNavigating}>
  {$wizard.progress.isLastStep ? "Finish" : "Next"}
</button>
```

Svelte 4 users write `on:click={wizard.goNext}` instead of `onclick=`.

### Runes API (Svelte 5)

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
<input bind:value={name.value} />
<button onclick={wizard.goNext} disabled={wizard.isNavigating}>
  {wizard.progress.isLastStep ? "Finish" : "Next"}
</button>
```

Both layers expose the **same flat key set**, the same slices, the same `actions`, and the
same navigation methods. Only the reactivity primitive differs.

### Sharing a wizard through context

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  import { createWizardStore, setWizardContext } from "@gooonzick/wizard-svelte";

  const wizard = setWizardContext(
    createWizardStore({ definition, initialData }),
  );
</script>

<Child />
```

```svelte
<!-- Child.svelte -->
<script lang="ts">
  import { getWizardContext } from "@gooonzick/wizard-svelte";

  const wizard = getWizardContext<SignupData>();
</script>

<span>{$wizard.currentStepId}</span>
```

The runes layer exports the same three helpers from `@gooonzick/wizard-svelte/runes` under
a **distinct context key**, so mixing both layers in one component tree cannot
cross-contaminate.

## Why not `bind:value={$wizard.data.name}`?

Because it would silently corrupt the machine. Svelte compiles that binding to "mutate the
object in place, then call `store.set(theSameObject)`". `machine.snapshot.data` is
deliberately **not** frozen, so the mutation would land — bypassing `updateData` /
`updateField` entirely: no `onDataChange`, no plugin hooks, no field watchers, no
`recalculateSkippedStatuses()`, no `onStateChange`. It would also require the aggregate to
expose `set`, which is meaningless (you cannot "set" `canGoNext`).

The aggregate is therefore a `Readable`, never a `Writable`, and the binding is a **compile
error** by design. Write through `wizard.field(key)` or `wizard.actions.*` instead.

## API Reference

### `createWizardStore(options)`

**Options** (`definition`, `initialData`, `context` and `plugins` are read **once** at
creation — they are not reactive; recreate the store to reconfigure):

- `definition: WizardDefinition<T>` — wizard configuration
- `initialData: T` — initial form data
- `context?: WizardContext` — optional context for validators/hooks (default `{}`)
- `onStateChange?`, `onStepEnter?`, `onStepLeave?`, `onComplete?`, `onCancel?`, `onReset?`, `onError?`, `onDataChange?`
- `plugins?: WizardPlugin<T>[]` — registered once at machine creation
- `autoDestroy?: boolean` — default `true`; registers `onDestroy(() => void store.destroy())`.
  The registration is wrapped in try/catch, so creating a store outside component
  initialisation is supported — you just own `destroy()` yourself.

**Returns** a `WizardStore<T>`:

| Member | Type | Notes |
| ------ | ---- | ----- |
| `subscribe` | `Readable<WizardSnapshot<T>>` | the flat aggregate behind `$wizard` |
| `state` | `Readable<WizardStoreState<T>>` | `currentStepId`, `currentStep`, `data`, `isCompleted`, `stepStatuses`, `progress` |
| `validation` | `Readable<WizardStoreValidation>` | `isValid`, `validationErrors` |
| `navigation` | `Readable<WizardStoreNavigation>` | `canGoNext`, `canGoPrevious`, `canGoBack`, `isFirstStep`, `isLastStep`, `visitedSteps`, `availableSteps`, `stepHistory` |
| `loading` | `Readable<WizardStoreLoading>` | `isValidating`, `isSubmitting`, `isNavigating`, `isLoadingStep` |
| `actions` | `WizardStoreActions<T>` | see below |
| `goNext` / `goPrevious` / `goTo` | `() => Promise<void>` | flat navigation methods |
| `goBack` / `goToStep` | deprecated | use `goPrevious()` / `goTo(stepId)` |
| `field(key)` | `Writable<T[K]>` | stable reference per key |
| `getMachine()` / `getManager()` | live instances | escape hatch |
| `destroy()` | `Promise<void>` | idempotent |
| `isDestroyed` | `boolean` | |

**Actions:** `updateData`, `setData`, `updateField`, `validate`, `validateAll`,
`canSubmit`, `submit`, `reset`, `cancel`, `serialize`, `restore`, `preloadStep`.

`reset` and `restore` return `void`, not `Promise<void>` (exact parity with the React
binding). They are dispatched fire-and-forget; a rejection — e.g. the
`WizardRestoreError` a malformed snapshot raises — is forwarded to your `onError`
callback rather than becoming an unhandled rejection.

### `createWizard(options)` (runes)

Identical options. Returns a `Wizard<T>` where every flat key is a **getter** instead of a
store value, plus `state` / `validation` / `navigation` / `loading` slice getters,
`actions`, the navigation methods, `field(key): WizardField<T[K]>` (a `{ get value, set
value }` pair usable with `bind:value={f.value}`), `getMachine()`, `getManager()`,
`destroy()` and `isDestroyed`.

Reactivity is `$state.raw` reassignment driven by manager subscriptions. There is
deliberately **no `$effect`** anywhere in the layer: outside a component `$effect` requires
`$effect.root()` and manual disposal, which is a teardown hazard for a library.

Because the snapshots are `$state.raw`, `wizard.data` is **not** deeply reactive. Mutating
`wizard.data.name = "x"` does nothing reactive *and* bypasses the machine — use
`wizard.field("name").value = "x"` or `wizard.actions.updateField("name", "x")`.

## Things to know

### Navigation flags: a synchronous seed, then the async result

`canGoNext` and `isLastStep` are seeded synchronously from core's `progress.isLastStep` (on
creation and on every step change), so they are correct on first paint for synchronous graphs.
The seed is conservative: a step whose `next` is an async resolver starts as "not last". The
authoritative values land one microtask later, once `getNextStepId()` / `getPreviousStepId()` /
`getAvailableSteps()` resolve; until then `canGoPrevious` is `false` and `availableSteps` is
empty on the first snapshot. This is identical in React, Vue and Solid. In tests, `await` a
macrotask (`new Promise((r) => setTimeout(r, 0))`) before asserting `canGoPrevious` or
`availableSteps`.

### `updateField` is a no-op on `Object.is` equality

Setting a field to its current value produces no state change, no `onDataChange`, and no
store emission. Do not assume `field.set(v)` always emits.

### `restore()` emits twice

The machine writes the restored state synchronously and then fires a fire-and-forget
`validate()`, producing a second, asynchronous emission.

### Lifetime is not tied to subscribers

The store never uses `readable(value, start)`, whose `stop` callback fires when the last
subscriber leaves. An `{#if}` toggle, an HMR swap, or a component that only reads the store
inside an event handler would otherwise tear the wizard down. Teardown happens only via
`destroy()` (or the automatic `onDestroy` registration).

### SSR / SvelteKit

Never create a wizard at **module scope** — one machine would be shared across every SSR
request. Create it inside component initialisation (or per `load`). `getContext` /
`setContext` are SSR-safe, `onDestroy` does run during SSR, and `destroy()` is safe on a
machine that never navigated.

### Svelte 5 store ↔ rune interop

If you prefer the store entry but want rune ergonomics, Svelte 5's `fromStore()` works out
of the box:

```svelte
<script lang="ts">
  import { fromStore } from "svelte/store";

  const wizard = createWizardStore<SignupData>({ definition, initialData });
  const snapshot = fromStore(wizard);
</script>

<h2>{snapshot.current.currentStepId}</h2>
```

`fromStore` / `toStore` are Svelte 5 only — this package never imports them at runtime.

## TypeScript Support

```typescript
interface MyFormData {
  name: string;
  email: string;
}

const wizard = createWizardStore<MyFormData>({
  definition,
  initialData: { name: "", email: "" },
});

wizard.field("name"); // ✓ Writable<string>
wizard.field("invalid"); // ✗ Error
wizard.actions.updateField("name", 123); // ✗ Error
```

## License

MIT
