import { createAnalyticsPlugin } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WizardForm } from "./components/wizard-form";
import { WizardProgress } from "./components/wizard-progress";
import {
	type RegistrationData,
	registrationInitialData,
	registrationStepTitles,
	registrationWizard,
} from "./registration-wizard";

/**
 * Demo of the WIZ-016 built-in analytics plugin. `createAnalyticsPlugin` auto-times
 * each step and counts backtracks; `analytics.getReport()` returns a live snapshot
 * (including the current step's still-open visit). Callbacks append a human-readable
 * event feed.
 */
type EventEntry = { id: string; text: string };

let analyticsSeq = 0;

export const AnalyticsExample: React.FC = () => {
	const [events, setEvents] = useState<EventEntry[]>([]);
	// Re-render trigger so the report panel reflects the latest getReport().
	const [, force] = useState(0);

	// Reference-stable analytics instance (read once at machine creation).
	const analytics = useMemo(() => {
		const push = (text: string) => {
			const id = `ev-${++analyticsSeq}`;
			setEvents((prev) => [...prev.slice(-19), { id, text }]);
		};

		return createAnalyticsPlugin<RegistrationData>({
			onStepView: (stepId) => push(`view: ${stepId}`),
			onStepComplete: (stepId, ms) => push(`complete: ${stepId} (${ms}ms)`),
			onBacktrack: (from, to) => push(`backtrack: ${from} → ${to}`),
			onWizardComplete: (_data, total) =>
				push(`wizard complete (${total}ms total)`),
			onDropOff: (stepId, ms) => push(`drop-off: ${stepId} (${ms}ms)`),
		});
	}, []);

	const plugins = useMemo(() => [analytics], [analytics]);

	const { navigation, actions, state, validation } = useWizard({
		definition: registrationWizard,
		initialData: registrationInitialData,
		plugins,
	});

	const report = analytics.getReport();

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-7xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">Analytics Plugin</h1>
					<p className="text-gray-600 mt-2">
						Built-in <code>createAnalyticsPlugin</code>: per-step timing,
						backtrack counting, and a live <code>getReport()</code> snapshot.
					</p>
				</div>

				<WizardProgress
					progress={state.progress}
					stepTitles={registrationStepTitles}
					stepStatuses={state.stepStatuses}
					onStepClick={(stepId) => navigation.goTo(stepId)}
				/>

				<div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
					<div>
						<WizardForm
							currentStepId={state.currentStep.id}
							data={state.data}
							validationErrors={validation.validationErrors}
							onFieldChange={actions.updateField}
						/>

						<div className="flex gap-4 mt-6">
							<Button
								variant="outline"
								onClick={() => navigation.goPrevious()}
								disabled={!navigation.canGoPrevious}
							>
								Previous
							</Button>
							{!navigation.isLastStep ? (
								<Button
									onClick={() => navigation.goNext()}
									disabled={!navigation.canGoNext}
								>
									Next
								</Button>
							) : (
								<Button
									onClick={() => actions.submit()}
									className="bg-green-600 hover:bg-green-700"
								>
									Submit
								</Button>
							)}
							<Button variant="outline" onClick={() => actions.reset()}>
								Reset
							</Button>
							<Button variant="outline" onClick={() => force((n) => n + 1)}>
								Refresh report
							</Button>
						</div>
					</div>

					<div className="bg-white border rounded-lg p-4 shadow-sm space-y-4">
						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Report</h2>
							<dl className="text-sm text-gray-700 space-y-1">
								<div className="flex justify-between">
									<dt>Current step</dt>
									<dd className="font-mono">{report.currentStep ?? "—"}</dd>
								</div>
								<div className="flex justify-between">
									<dt>Backtracks</dt>
									<dd className="font-mono">{report.backtrackCount}</dd>
								</div>
								<div className="flex justify-between">
									<dt>Total (ms)</dt>
									<dd className="font-mono">{report.totalDuration}</dd>
								</div>
								<div className="flex justify-between">
									<dt>Completed</dt>
									<dd className="font-mono">{String(report.completed)}</dd>
								</div>
							</dl>
							<h3 className="font-medium text-gray-800 mt-3 mb-1">
								Step timings (ms)
							</h3>
							<ul className="text-sm font-mono text-gray-700 space-y-1">
								{Object.entries(report.stepTimings).map(([id, ms]) => (
									<li key={id} className="flex justify-between">
										<span>{id}</span>
										<span>{ms}</span>
									</li>
								))}
							</ul>
						</div>

						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Event feed</h2>
							{events.length === 0 ? (
								<p className="text-sm text-gray-500">
									Navigate the wizard to see analytics callbacks fire.
								</p>
							) : (
								<ul className="space-y-1 text-sm font-mono text-gray-700 max-h-64 overflow-y-auto">
									{events.map((entry) => (
										<li key={entry.id}>{entry.text}</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
