---
title: Solid Integration
description: How to use createWizard, field() and WizardProvider to integrate wizards into your Solid application
---

# Solid Integration Guide

`@gooonzick/wizard-solid` binds a `WizardMachine` to Solid signals. `createWizard()` returns an object whose properties are **reactive getters**: read them in JSX, `createEffect` or `createMemo` and Solid tracks exactly the channel you touched.

> Supports **Solid 1.x** (`solid-js` ≥ 1.8). Solid 2.0 is not supported yet.

## Installation

```bash
npm install @gooonzick/wizard-core @gooonzick/wizard-solid
# or
pnpm add @gooonzick/wizard-core @gooonzick/wizard-solid
```

## Quick Start

```tsx
import { createLinearWizard } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { Match, Show, Switch } from "solid-js";

type Signup = { name: string; email: string; plan: string };

const definition = createLinearWizard<Signup>({
	id: "signup",
	steps: [
		{
			id: "personal",
			title: "Personal info",
			validate: async (d) =>
				d.name ? { valid: true } : { valid: false, errors: { name: "Name is required" } },
		},
		{ id: "plan", title: "Plan" },
		{ id: "summary", title: "Summary" },
	],
});

export function SignupWizard() {
	const wizard = createWizard({
		definition,
		initialData: { name: "", email: "", plan: "basic" },
		onComplete: (data) => console.log("submitted", data),
	});
	const name = wizard.field("name");

	return (
		<section>
			<h2>{wizard.currentStep.meta?.title}</h2>
			<progress value={wizard.progress.percentage} max="100" />

			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<input value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} />
					<Show when={wizard.validationErrors?.name}>{(msg) => <p>{msg()}</p>}</Show>
				</Match>
				<Match when={wizard.currentStepId === "plan"}>
					<p>Plan: {wizard.data.plan}</p>
				</Match>
				<Match when={wizard.currentStepId === "summary"}>
					<p>Ready to submit {wizard.data.name}</p>
				</Match>
			</Switch>

			<button onClick={() => void wizard.goPrevious().catch(() => {})} disabled={!wizard.canGoPrevious}>
				Back
			</button>
			<Show
				when={wizard.isLastStep}
				fallback={
					<button
						onClick={() => void wizard.goNext().catch(() => {})}
						disabled={!wizard.canGoNext || wizard.isNavigating}
					>
						Next
					</button>
				}
			>
				<button onClick={() => void wizard.actions.submit().catch(() => {})} disabled={wizard.isSubmitting}>
					Submit
				</button>
			</Show>
		</section>
	);
}
```

## The `wizard` object

| Group | Members |
| ----- | ------- |
| Flat getters | `currentStepId`, `currentStep`, `data`, `isCompleted`, `stepStatuses`, `progress`, `isValid`, `validationErrors`, `canGoNext`, `canGoPrevious`, `canGoBack`, `isFirstStep`, `isLastStep`, `visitedSteps`, `availableSteps`, `stepHistory`, `isValidating`, `isSubmitting`, `isNavigating` |
| Slices | `state`, `navigation`, `validation`, `loading` — the manager's frozen snapshots |
| Navigation | `goNext()`, `goPrevious()`, `goTo(stepId, options?)` (+ deprecated `goBack`, `goToStep`) |
| Actions | `wizard.actions.updateField`, `updateData`, `setData`, `validate`, `validateAll`, `canSubmit`, `submit`, `reset`, `cancel`, `serialize`, `restore` |
| Binding | `field(key)` |
| Escape hatches | `getMachine()`, `getManager()`, `destroy()`, `isDestroyed` |

The shape matches the Svelte runes API (`@gooonzick/wizard-svelte/runes`), so code and docs translate one-to-one.

## Reactivity

- **Read inside a tracking scope.** `wizard.canGoNext` in JSX re-renders when navigation changes. `const { canGoNext } = wizard` reads once and never updates — the same rule as Solid props.
- **Per-channel tracking.** The wizard holds four signals: `state`, `navigation`, `validation`, `loading`. Reading `wizard.data.name` subscribes to the whole `state` channel, so any data change re-runs that expression (DOM writes still only happen when the value differs).
- **Atomic updates.** All four signals are refreshed inside one `batch()`, so an effect never sees a new `currentStepId` together with a stale `canGoNext`.
- **Async navigation flags.** `canGoNext`, `canGoPrevious`, `isLastStep` and `availableSteps` are computed asynchronously (guards and resolvers may be async). Right after creation `canGoNext` and `canGoPrevious` start `false`, `isLastStep` starts `true` and `availableSteps` starts empty, until the first computation settles one microtask later — disable buttons on `canGoNext`/`canGoPrevious` rather than assuming `true`. Because `isLastStep` starts `true`, a `<Show when={wizard.isLastStep}>` toggle between Submit and Next (as in the Quick Start) renders Submit for that first moment on mount.
- **`canGoNext` is not validity.** It means "a next step exists"; validation runs inside `goNext()`, which rejects (and reports to `onError`) when the current step is invalid.
- **Non-reactive options.** `definition`, `initialData`, `context` and `plugins` are read once. Recreate the wizard (e.g. inside a keyed `<Show>`) to reconfigure.

## Binding inputs with `field()`

```tsx
const email = wizard.field("email");

<input value={email.value} onInput={(e) => (email.value = e.currentTarget.value)} />;
```

`field(key)` returns a stable `{ get value, set value }` object per key. Reads are reactive; writes call `machine.updateField`, which skips no-op writes (`Object.is`) and reports `changedFields = [key]` to `onDataChange`. Never mutate `wizard.data` directly — snapshots are frozen.

## Sharing a wizard with context

```tsx
import { createWizard, useWizardContext, WizardProvider } from "@gooonzick/wizard-solid";

function Parent() {
	const wizard = createWizard({ definition, initialData });
	return (
		<WizardProvider wizard={wizard}>
			<Step />
		</WizardProvider>
	);
}

function Step() {
	const wizard = useWizardContext<Signup>();
	return <p>{wizard.currentStepId}</p>;
}
```

- `WizardProvider` takes an **existing** wizard. Creation and ownership stay with the parent; the provider never destroys it. The `wizard` prop is read once.
- `useWizardContext<T>()` throws if no provider is above it. `hasWizardContext()` is a non-throwing probe.

## Lifecycle

- Created inside a component or `createRoot`, the wizard registers `onCleanup` and is destroyed with its owner (`autoDestroy: true`, the default). Plugins' `destroy()` hooks run in reverse order.
- Created without an owner (module scope, a shared store), nothing is registered — call `await wizard.destroy()` yourself. Pass `autoDestroy: false` to keep a component-created wizard alive past unmount.
- After `destroy()` the getters keep their last values and stop updating.
- Use the `createRoot((dispose) => …)` form. Solid treats a `createRoot` callback that takes **no** parameter as an unowned root whose cleanups never run, so `autoDestroy` cannot fire there — call `destroy()` yourself in that case.
- Don't create a wizard inside `createEffect` / `createMemo`: the computation becomes its owner, so every re-run destroys the previous wizard and creates a new one. Create it in the component body.

## Plugins

```ts
import { createLoggingPlugin } from "@gooonzick/wizard-core";

const wizard = createWizard({ definition, initialData, plugins: [createLoggingPlugin()] });
```

Plugins are registered once at creation. See the [plugin contract](/guide/plugins) and the [persistence plugin](/guide/plugins#built-in-plugin-createpersistenceplugin).

## Error handling

- Machine errors (validation, lifecycle hooks, plugins, `onDataChange` subscribers) go to `onError`.
- `goNext`, `goPrevious`, `goTo`, `submit` and `cancel` return promises that reject on failure (e.g. `goNext()` on an invalid step). Loading flags are always reset.
- `validate` **resolves** even on an invalid step — the result is reported through `isValid` / `validationErrors`, not through rejection. It rejects only if the operation was already aborted (via an `AbortSignal` passed in context) before the call; a `reset()`/`cancel()` while it is in flight does not reject it — that call is superseded and still resolves, without writing its result into state.
- `validateAll` also **resolves** with a `ValidationSummary` even when steps are invalid (a throwing step validator counts as invalid, not a rejection). It rejects if the wizard was already aborted, or if a step's `enabled` guard throws. Unlike `validate`, it has no supersede protection: a `reset()`/`cancel()` fired while it's running does not cancel it, and with `updateStatuses: true` its step statuses are still written into the (now post-reset) state.
- `reset()` and `restore()` are fire-and-forget; a malformed snapshot (`WizardRestoreError`) is reported to `onError`, never as an unhandled rejection.
- **Throwing effects.** Solid 1.x runs effects synchronously when the wizard updates its signals — inside the machine's transition. If a `createEffect` throws and no `<ErrorBoundary>` catches it, the wizard reports the error to `onError` and keeps working. Solid itself may leave other effects from that same update stale, so wrap effect-heavy UI in `<ErrorBoundary>` or use `catchError`.
- **Writes from effects.** Because effects run inside the transition, an effect that calls `wizard.actions.updateField(...)` when a step is entered re-enters the machine mid-transition. This works, but prefer step `onEnter` hooks for data initialisation.
- `onError` must not throw — a throw propagates to the caller, as in every other binding.

## SSR and SolidStart

- **Never create a wizard at module scope.** On the server, module scope is shared across every request — a module-scoped wizard would leak one user's data into another's response. Create it inside a component instead.
- Solid signals are not reactive on the server, so SSR renders the initial state only; interactivity takes over once the client hydrates.
- This binding has no SSR-specific tests yet — treat SolidStart support as unverified beyond the two points above.

## Limitations

- Solid 1.x only (`solid-js` ≥ 1.8).
- No SSR guarantees: Solid signals are not reactive on the server.
- `definition`, `initialData`, `context` and `plugins` are not reactive.
- Swapping the `wizard` passed to `WizardProvider` at runtime is not supported.

## Troubleshooting

### My button/text doesn't update

You destructured the wizard (`const { canGoNext } = wizard`) or read a getter outside a tracking scope — outside JSX, `createEffect` or `createMemo`. Read `wizard.<getter>` directly inside the tracked expression instead; see [Reactivity](#reactivity).

### `canGoNext` is true but Next does nothing / `Uncaught (in promise)`

`canGoNext` means "a next step exists", not "the current step is valid" — validation runs inside `goNext()`, which rejects when the current step is invalid. Render `wizard.validationErrors` and attach `.catch(() => {})` (or handle it via `onError`) to every navigation call, as in the [Quick Start](#quick-start).

### The wizard is never destroyed

Either it was created without an owner (module scope, a shared store) or inside a `createRoot` callback that takes **no** parameter — Solid treats that as an unowned root whose cleanups never run. Call `await wizard.destroy()` yourself in both cases; see [Lifecycle](#lifecycle).

### After `restore()` my test still sees the old step

`restore()` writes the restored state synchronously and then fires a fire-and-forget `validate()`, which lands one microtask later. Await two flushes before asserting:

```ts
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

wizard.actions.restore(snapshot);
await flush();
await flush();
expect(wizard.currentStepId).toBe("summary");
```

## Related Documentation

- [Solid API reference](/guide/api/solid)
- [Core Concepts](/guide/core-concepts)
- [Plugins](/guide/plugins)
- [Example app](https://github.com/gooonzick/wizard/tree/main/examples/solid-examples)
