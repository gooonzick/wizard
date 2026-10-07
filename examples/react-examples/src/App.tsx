import { useEffect, useState } from "react";
import { AnalyticsExample } from "./analytics-example";
import { DataChangeExample } from "./data-change-example";
import { HistoryExample } from "./history-example";
import { LazyStepsExample } from "./lazy-steps-example";
import { PersistencePluginExample } from "./persistence-plugin-example";
import { PluginsExample } from "./plugins-example";
import { ProviderExample } from "./provider-example";
import { ResetCancelExample } from "./reset-cancel-example";
import { StatePersistenceExample } from "./state-persistence-example";
import { WizardExample } from "./wizard-example";

type View =
	| "wizard"
	| "provider"
	| "history"
	| "reset-cancel"
	| "persistence"
	| "persistence-plugin"
	| "plugins"
	| "analytics"
	| "data-change"
	| "lazy-steps";

const tabs: Array<{ id: View; label: string }> = [
	{ id: "wizard", label: "Registration Wizard" },
	{ id: "provider", label: "Provider + Hooks" },
	{ id: "history", label: "Navigation History" },
	{ id: "reset-cancel", label: "Reset & Cancel" },
	{ id: "persistence", label: "State Persistence" },
	{ id: "persistence-plugin", label: "Persistence Plugin" },
	{ id: "plugins", label: "Plugins" },
	{ id: "analytics", label: "Analytics" },
	{ id: "data-change", label: "Data Change" },
	{ id: "lazy-steps", label: "Lazy Steps" },
];

const VIEWS: View[] = tabs.map((tab) => tab.id);

// The selected tab survives a reload so the persistence demo can show a real
// `window.location.reload()` — mirrors the Vue app's `wizard-approach` key.
const TAB_STORAGE_KEY = "wizard-react-tab";

const readSavedView = (): View => {
	try {
		const saved = localStorage.getItem(TAB_STORAGE_KEY);
		return saved && VIEWS.includes(saved as View) ? (saved as View) : "wizard";
	} catch {
		return "wizard"; // private mode / storage disabled
	}
};

export function App() {
	// Lazy initializer: pass the function, do not call it.
	const [view, setView] = useState<View>(readSavedView);

	useEffect(() => {
		try {
			localStorage.setItem(TAB_STORAGE_KEY, view);
		} catch {
			/* ignore */
		}
	}, [view]);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-7xl mx-auto pt-4 px-4 flex flex-wrap gap-2">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => setView(tab.id)}
						className={`px-4 py-2 rounded-md text-sm font-medium transition ${
							view === tab.id
								? "bg-gray-900 text-white"
								: "bg-white text-gray-700 border hover:bg-gray-50"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>
			{view === "wizard" && <WizardExample />}
			{view === "provider" && <ProviderExample />}
			{view === "history" && <HistoryExample />}
			{view === "reset-cancel" && <ResetCancelExample />}
			{view === "persistence" && <StatePersistenceExample />}
			{view === "persistence-plugin" && <PersistencePluginExample />}
			{view === "plugins" && <PluginsExample />}
			{view === "analytics" && <AnalyticsExample />}
			{view === "data-change" && <DataChangeExample />}
			{view === "lazy-steps" && <LazyStepsExample />}
		</div>
	);
}
