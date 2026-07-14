import { createLoggingPlugin, type WizardPlugin } from "@gooonzick/wizard-core";
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
 * Demo of the WIZ-007 plugin system: a logging plugin records transitions,
 * and a custom analytics plugin appends human-readable events to a list.
 */
type PluginLogEntry = { id: string; text: string };

let pluginLogSeq = 0;

export const PluginsExample: React.FC = () => {
	const [events, setEvents] = useState<PluginLogEntry[]>([]);

	// Reference-stable plugins array (read once at machine creation).
	const plugins = useMemo((): WizardPlugin<RegistrationData>[] => {
		const push = (text: string) => {
			const id = `log-${++pluginLogSeq}`;
			setEvents((prev) => [...prev.slice(-19), { id, text }]);
		};

		const eventLog: WizardPlugin<RegistrationData> = {
			name: "event-log",
			afterTransition(e) {
				push(`${e.type}: ${e.fromStepId} → ${e.toStepId}`);
			},
			onError(error, ctx) {
				push(`error(${ctx.phase}): ${error.message}`);
			},
			onReset() {
				push("reset");
			},
		};

		return [
			createLoggingPlugin<RegistrationData>({ level: "debug" }),
			eventLog,
		];
	}, []);

	const { navigation, actions, state, validation } = useWizard({
		definition: registrationWizard,
		initialData: registrationInitialData,
		plugins,
		onComplete: (data) => {
			console.log("Completed with plugins:", data);
		},
	});

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-7xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">Plugins Demo</h1>
					<p className="text-gray-600 mt-2">
						<code>createLoggingPlugin</code> + a custom{" "}
						<code>afterTransition</code> / <code>onError</code> plugin. Check
						the browser console for structured logs.
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
						</div>
					</div>

					<div className="bg-white border rounded-lg p-4 shadow-sm">
						<h2 className="font-semibold text-gray-900 mb-2">
							Plugin event log
						</h2>
						{events.length === 0 ? (
							<p className="text-sm text-gray-500">
								Navigate the wizard to see plugin hooks fire.
							</p>
						) : (
							<ul className="space-y-1 text-sm font-mono text-gray-700 max-h-80 overflow-y-auto">
								{events.map((entry) => (
									<li key={entry.id}>{entry.text}</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
