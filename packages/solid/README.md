# @gooonzick/wizard-solid

Solid.js integration for the Wizard framework — a signal-backed `createWizard()` with fine-grained reactive getters.

## Features

- **Signal-backed** - every property is a reactive getter; read it in JSX or `createEffect` and only that channel is tracked
- **Atomic updates** - state, navigation, validation and loading update in one `batch()`, so effects never see a half-applied transition
- **Two-way binding** - `wizard.field('name')` returns `{ get value, set value }` routed through `machine.updateField`
- **Context** - `<WizardProvider wizard={wizard}>` + `useWizardContext()` / `hasWizardContext()`
- **Owner-aware lifecycle** - destroyed with the owning component or `createRoot`; manual `destroy()` otherwise
- **Full Type Safety** - TypeScript generics for your data types

## Installation

```bash
npm install @gooonzick/wizard-solid @gooonzick/wizard-core
# or
pnpm add @gooonzick/wizard-solid @gooonzick/wizard-core
```

Requires `solid-js` 1.8 or newer (Solid 1.x). Solid 2.0 is not supported yet.

## Quick Start

```tsx
import { createLinearWizard } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { Match, Switch } from "solid-js";

type Signup = { name: string; plan: string };

const definition = createLinearWizard<Signup>({
	id: "signup",
	steps: [
		{
			id: "personal",
			title: "Personal",
			validate: async (d) =>
				d.name ? { valid: true } : { valid: false, errors: { name: "Required" } },
		},
		{ id: "plan", title: "Plan" },
	],
});

export function Signup() {
	const wizard = createWizard({
		definition,
		initialData: { name: "", plan: "basic" },
		onComplete: (data) => console.log("done", data),
	});
	const name = wizard.field("name");

	return (
		<form onSubmit={(e) => e.preventDefault()}>
			<h2>{wizard.currentStep.meta?.title}</h2>
			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<input value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} />
					<p>{wizard.validationErrors?.name}</p>
				</Match>
				<Match when={wizard.currentStepId === "plan"}>
					<p>Plan: {wizard.data.plan}</p>
				</Match>
			</Switch>
			<button
				type="button"
				onClick={() => void wizard.goPrevious().catch(() => {})}
				disabled={!wizard.canGoPrevious}
			>
				Back
			</button>
			<button
				type="button"
				onClick={() => void wizard.goNext().catch(() => {})}
				disabled={wizard.isNavigating}
			>
				{/* On the last step goNext() completes the wizard; canGoNext is false there. */}
				{wizard.progress.isLastStep ? "Finish" : "Next"}
			</button>
		</form>
	);
}
```

## Reactivity rules

- Read properties **inside** JSX, `createEffect` or `createMemo`. Destructuring (`const { canGoNext } = wizard`) reads once and loses reactivity — same as Solid props.
- Tracking is per channel (`state`, `navigation`, `validation`, `loading`), not per field.
- `definition`, `initialData`, `context` and `plugins` are read once. Recreate the wizard to reconfigure.

## Things to know

- `canGoNext` and `isLastStep` are seeded synchronously from `progress.isLastStep` (on creation and on every step change), so they are correct on first render for synchronous graphs; a step whose `next` is an async resolver starts as "not last" until the async computation settles. `canGoPrevious` and `availableSteps` come only from that async computation: right after creation `canGoPrevious` is `false` and `availableSteps` is empty.
- `canGoNext` means "a next step exists", not "the current step is valid" — validation runs inside `goNext()`.
- Loading flags (`isNavigating`, `isValidating`, `isSubmitting`) are reference-counted: a flag stays `true` while any operation that set it is still in flight, so a double-clicked Next rejected as busy, or an overlapping `validate()`, no longer clears another operation's flag.
- `goNext()`, `goPrevious()`, `goTo()`, `submit()` and `cancel()` reject on failure (for example an invalid step) in addition to reporting to `onError` — `await` them in a `try`, or `.catch(() => {})` when the UI already renders `validationErrors`. `validate()` **resolves** and exposes the result via `isValid` / `validationErrors`, even on an invalid step — it rejects only if the operation was already aborted (via an `AbortSignal` passed in context) before the call; a `reset()`/`cancel()` while it is in flight does not reject it, it just supersedes the result. `validateAll()` also **resolves** with a `ValidationSummary` even when steps are invalid (a throwing step validator counts as invalid) — it rejects if the wizard was already aborted, or if a step's `enabled` guard throws. Unlike `validate()`, it has no supersede protection: a `reset()`/`cancel()` fired while it's running does not cancel it, and with `updateStatuses: true` its step statuses are still written into the (now post-reset) state.

## Lifecycle

Created inside a component or `createRoot`, the wizard is destroyed with its owner (`autoDestroy: true` by default). Created elsewhere (module scope, a shared store), call `await wizard.destroy()` yourself.

## Errors

Machine errors go to `onError`. A `createEffect` that throws while the wizard updates its signals is also reported to `onError` (unless an `<ErrorBoundary>` catches it first): the wizard keeps working, but Solid may leave other effects of that update stale — wrap user effects in `<ErrorBoundary>` or `catchError`. This covers every signal update, including loading-flag changes and the async navigation recompute. Without an `onError`, these effect errors and `reset()` / `restore()` failures are logged with `console.error` instead of being dropped.

## Documentation

- [Solid Integration guide](https://gooonzick.github.io/wizard/guide/solid-integration)
- [Solid API reference](https://gooonzick.github.io/wizard/guide/api/solid)

## License

MIT
