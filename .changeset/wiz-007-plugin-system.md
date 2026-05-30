---
"@gooonzick/wizard-core": minor
"@gooonzick/wizard-react": minor
"@gooonzick/wizard-state": minor
"@gooonzick/wizard-vue": minor
---

feat: add a plugin system (WIZ-007)

Add runtime plugins to `WizardMachine` with global hooks: `onInit`,
`beforeTransition` (veto-capable), `afterTransition`, `onError`, `onComplete`,
`onReset`, and `destroy`. Register plugins via the new constructor `plugins`
argument or `machine.use(plugin)` (chainable; `removePlugin(name)` and
`machine.destroy()` for teardown in reverse order).

- A new `PluginHost` owns plugin dispatch; `beforeTransition` is awaited
  sequentially and can veto a transition by returning `false` (silent no-op —
  `goTo` still returns `Promise<void>`). Post-transition/lifecycle hooks are
  isolated: a throw routes to `onError` without stopping other plugins.
- Hook payloads are typed `DeepReadonly<T>` (compile-time immutability; no
  runtime clones).
- Ships a reference `createLoggingPlugin`, exported from
  `@gooonzick/wizard-core` and the new `@gooonzick/wizard-core/plugins` subpath.
- React (`useWizard`/`WizardProvider`) and Vue (`useWizard`) gain a `plugins`
  option and tear plugins down on unmount / scope dispose via the new
  `WizardStateManager.destroy()`.

`onDataChange` is intentionally deferred to WIZ-010 (will be added without a
breaking change). Built-in analytics/auto-save plugins remain future work.

Backward navigation (`goPrevious`/`goBack`) now defers its history mutation until after `beforeTransition`, so a veto leaves step history, the current step, and step statuses unchanged. As part of unifying this path, `goBack(n)` now marks the departing step `"visited"`, matching `goPrevious` (previously `goBack` did not). React teardown is also hardened against React StrictMode's mount→unmount→remount probe: a manager destroyed by the probe is transparently recreated (with the same plugins) on remount.
