# @gooonzick/wizard-svelte-example

A deliberately minimal Vite + Svelte 5 app demonstrating **both layers** of
[`@gooonzick/wizard-svelte`](../../packages/svelte).

```bash
pnpm --filter @gooonzick/wizard-svelte-example dev
pnpm --filter @gooonzick/wizard-svelte-example build
```

## What it shows

| Tab | File | Covers |
| --- | ---- | ------ |
| **Store API** | `src/StoreExample.svelte` | `createWizardStore`, `$wizard` auto-subscription, per-channel sub-stores (`navigation`, `loading`), `field()` two-way binding, progress, validation errors, `isNavigating`, `submit()`, `reset()` |
| **Runes API** | `src/RunesExample.svelte` | `createWizard` from `@gooonzick/wizard-svelte/runes`, flat rune getters, `bind:value={field.value}`, the same navigation/validation/submit/reset surface |
| **Context** | `src/ContextParent.svelte` + `src/ContextChild.svelte` | `setWizardContext` / `getWizardContext` — the child binds a field without receiving a single prop |

The wizard definition itself is framework-agnostic and lives in `src/wizard/`.

## Notes

- **Never `bind:` to `$wizard.data.x`.** The aggregate is a `Readable` on purpose; the
  binding would mutate `machine.snapshot.data` in place and bypass every hook. Both demos
  bind through `wizard.field(key)` instead.
- `vite.config.ts` sets `optimizeDeps.exclude: ["@gooonzick/wizard-svelte"]`. The `/runes`
  subpath ships uncompiled runes, and excluding the package from dependency pre-bundling
  removes a whole class of "`$state` is not defined" failures.
- The runes tab requires Svelte 5. The store tab works on Svelte 4 as well (with
  `on:click` instead of `onclick`).
