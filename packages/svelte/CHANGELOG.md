# @gooonzick/wizard-svelte

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
