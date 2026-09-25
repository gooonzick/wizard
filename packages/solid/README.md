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
			<button type="button" onClick={() => wizard.goPrevious()} disabled={!wizard.canGoPrevious}>
				Back
			</button>
			<button
				type="button"
				onClick={() => void wizard.goNext().catch(() => {})}
				disabled={!wizard.canGoNext || wizard.isNavigating}
			>
				Next
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

- `canGoNext` / `canGoPrevious` / `isLastStep` are computed asynchronously (guards and resolvers may be async), so `canGoNext` is `false` until the first computation settles.
- `canGoNext` means "a next step exists", not "the current step is valid" — validation runs inside `goNext()`.
- `goNext()`, `goPrevious()`, `goTo()`, `submit()` and `validate()` reject on failure (for example an invalid step) in addition to reporting to `onError` — `await` them in a `try`, or `.catch(() => {})` when the UI already renders `validationErrors`.

## Lifecycle

Created inside a component or `createRoot`, the wizard is destroyed with its owner (`autoDestroy: true` by default). Created elsewhere (module scope, a shared store), call `await wizard.destroy()` yourself.

## Errors

Machine errors go to `onError`. A `createEffect` that throws while the wizard updates its signals is also reported to `onError` (unless an `<ErrorBoundary>` catches it first): the wizard keeps working, but Solid may leave other effects of that update stale — wrap user effects in `<ErrorBoundary>` or `catchError`.

## Documentation

- [Solid Integration guide](https://gooonzick.github.io/wizard/guide/solid-integration)
- [Solid API reference](https://gooonzick.github.io/wizard/guide/api/solid)

## License

MIT
