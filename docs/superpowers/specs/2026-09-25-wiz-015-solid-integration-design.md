# WIZ-015 — Solid.js Integration — Design Spec

**Status:** Approved (brainstorming)
**Date:** 2026-09-25
**Package(s):** `@gooonzick/wizard-solid` (new); release plumbing touches the fixed group (`core`, `react`, `vue`, `state`, `svelte`)
**Release:** Minor, additive (non-breaking). With the fixed group this ships as **1.10.0**.
**Branch:** `feat/wiz-015-solid-integration`

## 1. Context & Goals

Solid.js has a growing audience, largely via the TanStack ecosystem (Form, Router, Query all ship Solid adapters). `@gooonzick/wizard` already ships React, Vue and Svelte bindings over a framework-agnostic `WizardMachine` + `WizardStateManager`. WIZ-015 adds a first-class Solid binding.

### Scope decisions (from brainstorming)

- **Solid 1.x only.** Peer dependency `solid-js ^1.8.0`. Solid 2.0 (currently `2.0.0-rc.9`) changes write semantics (staged writes committed on the next microtask, `flush()`) and the context API; support for it is a separate follow-up once 2.0 is stable.
- **API shape = the Svelte runes binding** (`packages/svelte/src/runes/`): flat reactive getters, slice getters, an `actions` object, navigation methods at the top level, `field(key)`. This intentionally diverges from the ROADMAP sketch (which put `goNext` inside `wizard.navigation`); in every shipped binding `navigation` holds flags only.
- **In scope for the first release:** `createWizard()`, context (`WizardProvider` / `useWizardContext` / `hasWizardContext`), `field(key)`, an example app, a docs page + API reference, agent-skill updates, changeset, ROADMAP update.
- **Reactivity mechanism: one signal per manager channel** (approach A). Rejected: `createStore` + `reconcile` (deep-diff cost, turns `wizard.data` into a proxy and breaks the reference identity the manager, `onDataChange` and plugins rely on, negligible perf win for wizard forms) and Solid's `from()` (subscription lifetime tied to an owner; no explicit `destroy()` outside a component).

### Non-goals

- Solid 2.0 support.
- SSR. Solid signals are not reactive on the server; the binding is not tested there. (It must not crash on import, but no SSR behaviour is promised.)
- Reactive `definition` / `initialData` / `context` / `plugins` — read once at creation, like every other binding.
- Hot-swapping the wizard instance passed to `WizardProvider`.

## 2. Current State (relevant existing architecture)

- `WizardMachine(definition, context, initialData, events, plugins)` fires `events.onStateChange(snapshot)` from `notifyStateChange()` **without a try/catch** (`packages/core/src/machine/wizard-machine.ts`). It also fires it synchronously from its constructor (first-step initialisation).
- `WizardStateManager` (`packages/state/src/manager.ts`):
  - `subscribe(listener, channel = "all")` with channels `state | navigation | validation | loading | all`.
  - `notifySubscribers(channels)` refreshes **all affected channel caches first**, then calls the union of the channel listeners plus every `"all"` listener. `notifySubscribersForChannel(channel)` (used by `setLoadingState` and the async navigation recompute) also always notifies `"all"` listeners.
  - Channel caches are frozen/cached objects; an **unaffected** channel keeps the same reference. An **affected** channel always gets a new object: `updateStateCache` and `updateNavigationCacheSync` rebuild unconditionally (only the async navigation recompute is content-compared before replacement). Consequence: tracking granularity is **per channel, not per field** — any data change re-runs effects reading any state or navigation field. Do not write tests asserting otherwise (e.g. "typing does not re-run an effect reading `currentStepId`" would fail).
  - `destroy()` sets `destroyed`, clears all subscriber sets and awaits `machine.destroy()` (plugins destroyed in reverse order; plugin-destroy rejections isolated by the machine).
  - `runReset(data)`, `runCancel()`, `runRestore(state)` own loading flags.
- The Svelte runes binding (`packages/svelte/src/runes/create-wizard.svelte.ts`, `types.ts`, `context.svelte.ts`) is the reference implementation for wiring, actions, loading flags, `field()`, error reporting and teardown.

## 3. Package Structure & Tooling

```
packages/solid/
  src/
    index.ts           — public API: createWizard, WizardProvider, useWizardContext, hasWizardContext, types
    create-wizard.ts   — machine → manager → signals wiring, actions, field(), destroy
    context.ts         — createContext + WizardProvider (createComponent, no JSX)
    types.ts           — CreateWizardOptions, Wizard<T>, slice types, WizardField
  tests/               — *.test.ts and *.test.tsx, helpers/
  package.json, vite.config.ts, vitest.config.ts, tsconfig.json, tsconfig.build.json, biome.json, README.md
```

- **`package.json`:** name `@gooonzick/wizard-solid`, version `1.9.0` (changesets bumps it with the group), `type: module`, `sideEffects: false`, single `"."` export (`types` + `import` → `dist/index.js`), `files: ["dist", "README.md"]`, scripts `build` / `typecheck` / `test` / `test:watch` / `lint` / `lint:fix` mirroring `packages/svelte`.
  - `peerDependencies`: `solid-js: ^1.8.0`.
  - `dependencies`: `@gooonzick/wizard-core`, `@gooonzick/wizard-state` (`workspace:*`).
  - `devDependencies`: `solid-js ^1.9`, `vite-plugin-solid`, `@solidjs/testing-library`, `jsdom`, plus the same biome/vite/vitest/`vite-plugin-dts`/`@vitest/coverage-v8`/typescript/`@types/node` versions used by `packages/svelte`.
- **No JSX in `src/`.** `WizardProvider` is built with `createComponent`. The package therefore builds with a plain `vite build` (ESM lib) + `vite-plugin-dts`, needs no `"solid"` export condition and no `babel-preset-solid` at build time. `rollupOptions.external`: `solid-js`, `solid-js/web`, `@gooonzick/wizard-core`, `@gooonzick/wizard-state`.
- **Tests:** `vitest.config.ts` uses `vite-plugin-solid` (compiles `.tsx` tests), `environment: "jsdom"`, `include: ["tests/**/*.test.{ts,tsx}"]`, and aliases `@gooonzick/wizard-core` / `@gooonzick/wizard-state` to their `src/index.ts` (same as svelte/react/vue). **Do not set `resolve.conditions`:** on Vite 6+ `vite-plugin-solid` already adds `solid` / `browser` / `development` in test mode (verified: client build, `isServer === false`), and an explicit list would replace Vite's default client conditions. In test mode the plugin also defaults `test.environment` to `jsdom`, sets `test.server.deps.external: [/solid-js/]`, and auto-adds `@testing-library/jest-dom` as a setup file if resolvable. Coverage thresholds 70/60/60/70; exclude `src/types.ts`.
- **tsconfig:** `jsx: "preserve"`, `jsxImportSource: "solid-js"` so `.tsx` tests typecheck.
- **Biome:** `.tsx` is linted normally; no exclusion needed.
- **Monorepo wiring:**
  - `.changeset/config.json`: add `@gooonzick/wizard-solid` to the `fixed` group.
  - `knip.json`: add `packages/solid` (entry `src/index.ts!`, project `src/**/*.ts`, `tests/**/*.{ts,tsx}`) and `examples/solid-examples`.
  - `.github/workflows/pr-checks.yml`: add `solid` to the per-package loop.
  - `.github/workflows/publish.yml`: add `solid` to the package choice, to the `all` list and as a publish step.
  - `.github/labeler.yml`: label for `packages/solid/**`.
  - `.syncpackrc`: rule for `solid-js` matching the one added for `svelte`.
  - `AGENTS.md` (monorepo structure) and `CONTRIBUTING.md`.

## 4. API & Wiring

### Types (`types.ts`)

Same shape as `packages/svelte/src/runes/types.ts` (names identical; Svelte-specific doc comments adapted):

- `CreateWizardOptions<T extends WizardData>`
  - Read once, not reactive: `definition`, `initialData`, `context?` (default `{}`), `plugins?`.
  - Callbacks: `onStateChange`, `onStepEnter`, `onStepLeave`, `onComplete`, `onCancel`, `onReset`, `onError`, `onDataChange`.
  - `autoDestroy?: boolean` (default `true`) — see §5.
- Slice types: `WizardStoreState<T>`, `WizardStoreValidation`, `WizardStoreNavigation`, `WizardStoreLoading`, `WizardStoreActions<T>`.
- `WizardField<V>`: `{ get value(): V; set value(v: V) }`.
- `Wizard<T>`:
  - Flat read-only getters: `currentStepId`, `currentStep`, `data`, `isCompleted`, `stepStatuses`, `progress`, `isValid`, `validationErrors`, `canGoNext`, `canGoPrevious`, `canGoBack`, `isFirstStep`, `isLastStep`, `visitedSteps`, `availableSteps`, `stepHistory`, `isValidating`, `isSubmitting`, `isNavigating`.
  - Slice getters: `state`, `navigation`, `validation`, `loading`.
  - `actions: WizardStoreActions<T>` — `updateData`, `setData`, `updateField`, `validate`, `validateAll`, `canSubmit`, `submit`, `reset` (void), `cancel`, `serialize`, `restore` (void).
  - Navigation: `goNext`, `goPrevious`, `goTo(stepId, options?)`, deprecated `goBack(steps?)` and `goToStep(stepId)`.
  - `field(key)`, `getMachine()`, `getManager()`, `destroy()`, `isDestroyed`.

### Wiring (`create-wizard.ts`)

1. **Machine + manager** constructed exactly as in the Svelte runes binding: forward refs `managerRef` / `previousState`, guarded `onStateChange` that calls `managerRef.handleStateChange(new, old)` only once the manager exists, then forwards to the user callback; other callbacks forwarded 1:1; `plugins` passed to the machine.
2. **Signals:** four `createSignal(manager.getXSnapshot())` — state, navigation, validation, loading — with Solid's default `===` equality. Because unaffected channel caches keep their reference, a set with an unchanged snapshot is skipped by the signal.
3. **Single `"all"` subscription, batched:**
   ```ts
   manager.subscribe(() => {
     try {
       batch(() => {
         setState(manager.getStateSnapshot());
         setNavigation(manager.getNavigationSnapshot());
         setValidation(manager.getValidationSnapshot());
         setLoading(manager.getLoadingSnapshot());
       });
     } catch (error) {
       reportError(error);
     }
   }, "all");
   ```
   In Solid 1.x an unbatched signal write flushes effects immediately, so per-channel writes would let an effect observe a new `currentStepId` next to a stale `canGoNext`. `batch()` commits all channels atomically. Since the manager refreshes every affected cache before notifying, all four getters are consistent at that point.
4. **Getters** read the signals (`get canGoNext() { return navigation().canGoNext; }`), giving fine-grained tracking in JSX/effects.
5. **Actions & navigation** ported from the Svelte runes binding without behavioural change:
   - `withNavigating(fn)` toggles `isNavigating` via `manager.setLoadingState` in `try/finally`.
   - `validate` / `validateAll` toggle `isValidating`; `submit` toggles `isSubmitting`.
   - `updateField` calls `machine.updateField` directly (preserves the WIZ-010 `Object.is` no-op guard and `changedFields = [field]`).
   - `reset(data?)` → `void manager.runReset(data ?? initialData).catch(reportError)`; `restore(s)` → `void manager.runRestore(s).catch(reportError)`; `cancel` → `manager.runCancel()`.
   - `goToStep(id)` = `goTo(id, { skipValidation: true })`.
6. **`field(key)`** returns a per-key cached object: `get value()` reads `state().data[key]` (reactive), `set value(v)` calls `machine.updateField(key, v)`. Usage: `<input value={f.value} onInput={(e) => (f.value = e.currentTarget.value)} />`.
7. **`reportError(error)`** normalises non-`Error` values and calls `callbacks.onError?.(error)`.

### Documented caveats

- Destructuring (`const { canGoNext } = wizard`) loses reactivity, as with Solid props.
- `definition` / `initialData` / `context` / `plugins` are not reactive; recreate the wizard to reconfigure.
- Solid 1.x only; no SSR guarantees.
- **Synchronous re-entrancy.** Solid 1.x runs `createEffect`s synchronously at the end of `batch()`, i.e. inside the machine's `notifyStateChange()` call stack (before `afterTransition`). An effect that calls an action (e.g. `updateField` on step entry) re-enters the machine mid-transition. This is already possible via `onStateChange` in every binding, so it is not new machine behaviour, but it is more reachable here than in React/Vue/Svelte (which defer). Document it; covered by a test in §6.

## 5. Lifecycle, Context & Errors

### Lifecycle

- **`autoDestroy`** (default `true`): if `getOwner()` is non-null, register `onCleanup(() => void destroy())`. A wizard created in a component or in `createRoot` is destroyed with its owner. With no owner (module scope, external store), nothing is registered — the caller owns `destroy()` — and Solid's dev warning about cleanups outside a root is never triggered.
- **`destroy()`** is idempotent (`destroyed` flag) and awaits `manager.destroy()` (clears subscribers → signals stop updating and keep their last values; machine destroys plugins in reverse order).
- **`isDestroyed`** = `destroyed || manager.isDestroyed`.
- Plugin `onInit` is dispatched fire-and-forget by the machine, same as other bindings.

### Context (`context.ts`)

- `const WizardContext = createContext<Wizard<any> | undefined>(undefined)` with `// biome-ignore lint/suspicious/noExplicitAny` (precedent: `packages/react/src/wizard-provider.tsx:48`).
- `WizardProvider<T>(props: { wizard: Wizard<T>; children?: JSX.Element }): JSX.Element` implemented as `createComponent(WizardContext.Provider, { value: props.wizard, get children() { return props.children; } })`. The provider takes an **existing** wizard (like Svelte's `setWizardContext`, unlike React's options-taking provider): creation and ownership stay with the caller; the provider never destroys anything. `props.wizard` is read once.
- `useWizardContext<T>(): Wizard<T>` — throws `Error("useWizardContext() must be called inside a <WizardProvider wizard={...}>.")` when no provider is present.
- `hasWizardContext(): boolean` — `useContext(WizardContext) !== undefined`. Solid's `useContext` returns the default outside a provider/owner, so no try/catch is needed.

### Errors

- **Listener isolation** (see §4 step 3): a user `createEffect` that throws during the batched flush is caught and routed to `onError`, so the exception never propagates into `WizardStateManager.notifySubscribers` or the machine's `notifyStateChange()` mid-transition. With an `<ErrorBoundary>` above the effect, Solid handles the error first and it never reaches the binding.
  - **Scope of the guarantee:** the *wizard* (machine, manager, signals, getters) survives. The *Solid UI* does not necessarily recover: Solid 1.x leaves other effects queued in the same flush stale (verified: a sibling effect ran 0 times after the throw, even after further writes). Docs must say "the wizard keeps working", not "the UI recovers", and recommend `<ErrorBoundary>` / `catchError` for user effects.
- Machine-originated errors (validation, lifecycle, plugins, `onDataChange`) reach `onError` through the machine's `handleError`; the binding does not duplicate them.
- `goNext` / `goPrevious` / `goTo` / `submit` / `validate` / `validateAll` / `cancel` return promises; rejections propagate to the caller; loading flags reset in `finally`.
- `reset` / `restore` are fire-and-forget; a malformed snapshot (`WizardRestoreError`) goes to `onError`, never an unhandled rejection.

## 6. Testing

Vitest + jsdom + `vite-plugin-solid`; component tests use `@solidjs/testing-library` (its `@solidjs/router` peer is optional — `peerDependenciesMeta.optional`, verified with 0.8.10; no router needed). Helpers `tests/helpers/wizard.ts` (3-step `signup`: `personal → plan → summary`, `personal` invalid while `name` is empty) and `tests/helpers/flush.ts` copied from `packages/svelte/tests/helpers/`. Tests assert through the public `Wizard` API and callbacks/spies only (AGENTS.md §4).

| File | Covers |
| --- | --- |
| `create-wizard.test.ts` | Initial values; flat getters equal slice fields; `goNext` / `goPrevious` / `goTo` move the step; invalid step blocks `goNext` and sets `validationErrors`; `isNavigating` toggles; `onStepEnter` / `onStepLeave` / `onComplete` / `onStateChange` forwarded |
| `reactivity.test.ts` | In `createRoot` + `createEffect` with run counters: `canGoNext` effect re-runs after the async navigation recompute; **batch atomicity** — an effect reading `currentStepId` + `isFirstStep` never observes a mixed state; a `loading` change does not re-run an effect reading only `currentStepId`; a no-op `updateField` re-runs nothing; **re-entrancy** — an effect on `currentStepId` that calls `actions.updateField` on step entry does not throw and leaves a consistent final state |
| `actions.test.ts` | Every action; loading flags; malformed `restore` → `onError`, no unhandled rejection |
| `field.test.ts` | Stable reference per key; reactive read; write → `onDataChange` with `changedFields = [key]`; `Object.is` no-op |
| `errors.test.ts` | Throwing `createEffect` without `ErrorBoundary` → `onError` called and a subsequent `goNext` works — asserted via **getters** (`wizard.currentStepId`), not via another `createEffect` (Solid leaves sibling effects stale, see §5); inside `<ErrorBoundary>` Solid catches it |
| `teardown.test.ts` | Inside `createRoot`: `dispose()` → `isDestroyed`, plugin `destroy` called. Without an owner: no `console.warn`, repeated `destroy()` is a no-op. Signals stop changing after destroy |
| `plugins.test.ts` | `plugins` option: `onInit`, `beforeTransition` / `afterTransition`, veto, destroy on dispose |
| `context.test.tsx` | `WizardProvider` → `useWizardContext()` in a child returns the same instance; missing provider throws; `hasWizardContext()` true/false |
| `components/wizard.test.tsx` | Real component: `<input>` bound via `field("name")`, Next disabled until valid, `<Show>`/`<Switch>` swaps steps; `fireEvent.input` / `click` |
| `types.test.ts` | `expectTypeOf`: `field` accepts only `keyof T`; `actions.updateField` types value by key; `T` inferred from `definition` |

**Verification before completion:** `pnpm turbo run test --filter=@gooonzick/wizard-solid`, `pnpm typecheck`, `pnpm lint:fix`, `pnpm build`.

## 7. Example App, Docs & Release

### `examples/solid-examples` (`@gooonzick/wizard-solid-example`, private)

- Vite + `vite-plugin-solid`; `typecheck` = `tsc --noEmit`; `biome.json`, `tsconfig.json` (`jsxImportSource: "solid-js"`), `index.html`, `README.md`, `app.css`.
- `src/wizard/{definition,initial-data,types}.ts` copied from `examples/svelte-examples/src/wizard/` so all framework examples run the same wizard.
- `src/App.tsx` switches between:
  - `BasicExample.tsx` — `createWizard`, `field()` inputs, `<Switch>/<Match>` on `currentStepId`, progress, buttons bound to `canGoNext` / `isNavigating`, validation errors.
  - `ContextExample.tsx` + `ContextChild.tsx` — `WizardProvider` and `useWizardContext()` in a descendant step.

### Documentation (docs exist in both `docs/` and `packages/docs/guide/`; update both)

- New `solid-integration.md`: install, quick start, reactivity (getters vs destructuring, batching), `field()`, context, lifecycle (owner, `autoDestroy`, manual `destroy()`), plugins, error handling (effect isolation, `ErrorBoundary`), limitations (Solid 1.x only, no SSR, non-reactive config).
- New `api/solid.md`: reference for `createWizard`, `CreateWizardOptions`, `Wizard<T>`, slices, `WizardField`, `WizardProvider`, `useWizardContext`, `hasWizardContext`.
- Updates: `getting-started.md`, `api-reference.md`, `ci-cd.md`, `docs/README.md`, `packages/docs/.vitepress/config.ts` (nav + sidebar), `packages/docs/index.md` (install), root `README.md` (install + package tree).
- Agent skill: `.agents/skills/wizard-library/references/api_reference.md` (Solid section) and `architecture_and_changes.md`.
- `packages/solid/README.md` (npm README).

### Release

- `.changeset/wiz-015-solid-integration.md`: `minor` for all fixed-group packages including `@gooonzick/wizard-solid`, same wording pattern as the WIZ-014 entry (the changeset file was consumed at release; copy the wording from `packages/svelte/CHANGELOG.md` 1.9.0).
- `docs/ROADMAP.md` — **done after PR gooonzick/wizard#37 (roadmap sync to 1.9.0) is merged and this branch is rebased**, to avoid conflicts. If #37 is still open when steps 1–4 are done, open the WIZ-015 PR without the ROADMAP change and land it as a follow-up commit on the same branch once #37 merges (before the WIZ-015 PR is merged). Changes: WIZ-015 → `✅ Done (see "Shipped vs. specced deltas")` with the deltas (Svelte-runes API shape instead of the sketch, provider takes an existing wizard, Solid 1.x only); "What is Already Implemented" row; competitor matrix bindings cell (`React/Vue/Svelte/Solid`); Appendix A; a 1.10.0 row in the release table.

### Commit sequence on `feat/wiz-015-solid-integration`

1. This spec.
2. Package + tests (+ monorepo wiring from §3).
3. Example app.
4. Docs + agent skill.
5. Changeset + ROADMAP.

Then one PR against `main`.
