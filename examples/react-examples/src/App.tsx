import { useState } from "react";
import { HistoryExample } from "./history-example";
import { WizardExample } from "./wizard-example";

export function App() {
	const [view, setView] = useState<"wizard" | "history">("wizard");

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-7xl mx-auto pt-4 px-4 flex gap-2">
				<button
					type="button"
					onClick={() => setView("wizard")}
					className={`px-4 py-2 rounded-md text-sm font-medium transition ${
						view === "wizard"
							? "bg-gray-900 text-white"
							: "bg-white text-gray-700 border hover:bg-gray-50"
					}`}
				>
					Registration Wizard
				</button>
				<button
					type="button"
					onClick={() => setView("history")}
					className={`px-4 py-2 rounded-md text-sm font-medium transition ${
						view === "history"
							? "bg-gray-900 text-white"
							: "bg-white text-gray-700 border hover:bg-gray-50"
					}`}
				>
					Navigation History
				</button>
			</div>
			{view === "wizard" ? <WizardExample /> : <HistoryExample />}
		</div>
	);
}
