import { createSignal, For, Match, Switch } from "solid-js";
import { BasicExample } from "./BasicExample";
import { ContextExample } from "./ContextExample";

type Tab = "basic" | "context";

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: "basic", label: "createWizard" },
	{ id: "context", label: "Context" },
];

export function App() {
	const [tab, setTab] = createSignal<Tab>("basic");

	return (
		<main>
			<h1>WizardForm — Solid examples</h1>
			<p class="lede">
				The same wizard driven by <code>@gooonzick/wizard-solid</code>.
				Switching tabs unmounts the previous demo, which destroys its machine —
				so each tab starts from a clean wizard.
			</p>

			<div class="tabs" role="tablist">
				<For each={TABS}>
					{({ id, label }) => (
						<button
							type="button"
							role="tab"
							aria-selected={tab() === id}
							onClick={() => setTab(id)}
						>
							{label}
						</button>
					)}
				</For>
			</div>

			<Switch>
				<Match when={tab() === "basic"}>
					<BasicExample />
				</Match>
				<Match when={tab() === "context"}>
					<ContextExample />
				</Match>
			</Switch>
		</main>
	);
}
