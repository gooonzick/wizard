# @gooonzick/wizard-svelte

## 1.10.0

### Minor Changes

- 5154f2e: Isolate `onStateChange` subscriber errors. A throwing `onStateChange` subscriber (a user callback or a framework binding's listener) is now reported through `onError` (and plugin `onError` with the new `ErrorContext.phase` value `"state"`) instead of throwing into the machine and rejecting the in-flight operation (`goNext()`, `updateField`, etc.), matching how `onDataChange` subscriber errors are already handled.

  **Behaviour change:** code that relied on `goNext()` rejecting when an `onStateChange` callback throws must read the error from `onError`; plugins with an exhaustive `switch` on `ErrorContext.phase` need a `"state"` case.

  Relatedly, a throwing `onStateChange` during `validate()` or first-step initialization is no longer misreported as a validation failure (phase `"validation"`, forcing `valid: false`) or a lifecycle error (phase `"lifecycle"`); it is reported with phase `"state"` and the validation result / initialization stands.

- 5154f2e: Add `WizardStateManager.trackLoading(flag, fn)`, a reference-counted way to toggle loading flags, and use it in `@gooonzick/wizard-solid` so overlapping or rejected operations (a double-clicked Next rejected as busy, concurrent `validate()`/`validateAll()`, `cancel()` mid-transition) no longer clear another operation's `isNavigating`/`isValidating`/`isSubmitting` early. `reset()`/`restore()`/`cancel()` still force all flags off.
- 5154f2e: Add `@gooonzick/wizard-solid` (WIZ-015): a Solid.js 1.x binding. `createWizard()` returns
  flat reactive getters (`wizard.currentStepId`, `wizard.canGoNext`, ...) backed by one signal
  per state-manager channel, refreshed atomically in a single `batch()`; slice getters;
  `actions`; `wizard.field(key)` two-way bindings routed through `machine.updateField`;
  `WizardProvider` / `useWizardContext` / `hasWizardContext`; and owner-aware teardown
  (`onCleanup` when created under a Solid owner). A `createEffect` that throws while the
  wizard updates its signals is reported to `onError` instead of breaking the transition.

  All packages are released together at the same fixed version.

### Patch Changes

- Updated dependencies [5154f2e]
- Updated dependencies [5154f2e]
- Updated dependencies [5154f2e]
  - @gooonzick/wizard-core@1.10.0
  - @gooonzick/wizard-state@1.10.0

## 1.9.0

### Minor Changes

- 7bdd065: Add `@gooonzick/wizard-svelte` (WIZ-014): a Svelte binding with two layers — a classic
  store API (`createWizardStore`, works on Svelte 4 and 5) on the main entry, and a Svelte 5
  runes API (`createWizard`) on the `@gooonzick/wizard-svelte/runes` subpath. Both expose the
  same flat reactive surface (`$wizard.currentStepId`, `$wizard.canGoNext`, ...), per-channel
  sub-stores/slices, `wizard.field(key)` two-way bindings routed through
  `machine.updateField`, context helpers, and manager-owned loading flags.

  All packages are released together at the same fixed version.

### Patch Changes

- bc9232a: Fix two binding bugs found while implementing WIZ-014's Svelte parity audit:

  - `@gooonzick/wizard-react`'s granular `useWizardActions().updateField` (from
    `use-wizard-granular.tsx`) went through `updateData` instead of calling
    `machine.updateField` directly, losing the WIZ-010 `Object.is` no-op guard and the
    authoritative `changedFields = [field]`. It now calls `machine.updateField` directly,
    matching `useWizard()`'s main hook, Vue, and Svelte. **Technically observable:** a
    same-value `updateField` through the granular hook no longer emits `onStateChange` (it
    already emitted no `onDataChange`).
  - `@gooonzick/wizard-react`'s `reset`/`restore` (`use-wizard.tsx` and
    `use-wizard-granular.tsx`) were fire-and-forget with no `.catch()`, so a malformed
    `restore()` payload (`WizardRestoreError`) became an unhandled promise rejection instead
    of reaching `onError`. `@gooonzick/wizard-vue`'s `reset`/`restore` had the same underlying
    gap, manifesting as an uncaught synchronous throw instead. Both now forward the error to
    `onError`, matching `@gooonzick/wizard-svelte`'s existing behavior.

    **Behavior change for Vue consumers:** `wizard.actions.restore(bad)` / `reset(bad)` no
    longer throw synchronously, so an existing
    `try { wizard.actions.restore(bad) } catch { ... }` will stop firing — there is no
    compile or runtime error, the catch block simply never runs. Read the failure from
    `onError` instead. Vue's `reset`/`restore` still call the machine directly and mirror
    the loading flags locally (they deliberately do not route through
    `manager.runReset`/`runRestore`); only error routing changed.

  All packages are released together at the same fixed version.

- Updated dependencies [bc9232a]
- Updated dependencies [7bdd065]
  - @gooonzick/wizard-core@1.9.0
  - @gooonzick/wizard-state@1.9.0
