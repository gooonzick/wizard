import { useState } from "react";
import { HistoryExample } from "./history-example";
import { ResetCancelExample } from "./reset-cancel-example";
import { WizardExample } from "./wizard-example";

type View = "wizard" | "history" | "reset-cancel";

export function App() {
	const [view, setView] = useState<View>("wizard");

	const tabs: Array<{ id: View; label: string }> = [
		{ id: "wizard", label: "Registration Wizard" },
		{ id: "history", label: "Navigation History" },
		{ id: "reset-cancel", label: "Reset & Cancel" },
	];

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
			{view === "history" && <HistoryExample />}
			{view === "reset-cancel" && <ResetCancelExample />}
		</div>
	);
}
