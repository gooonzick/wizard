import {
	createPersistencePlugin,
	localStorageAdapter,
	type WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
 * Demo of the WIZ-006 built-in persistence plugin. `createPersistencePlugin`
 * restores a stored snapshot inside `onInit`, debounces data-change writes,
 * saves immediately after every committed transition, and clears the record on
 * complete / reset / cancel.
 *
 * The payoff is the "Reload page" button: the wizard comes back on the step you
 * left it on, with the form data intact.
 */
type EventEntry = { id: string; text: string };

const STORAGE_KEY = "wizard:react-examples:persistence-plugin";

let evSeq = 0;

export const PersistencePluginExample: React.FC = () => {
	const [events, setEvents] = useState<EventEntry[]>([]);
	const [restoreStatus, setRestoreStatus] = useState("checking storage…");
	const [pending, setPending] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
	// Forces the raw-storage panel to re-read localStorage after every write.
	const [rawTick, setRawTick] = useState(0);
	const [redactEmail, setRedactEmail] = useState(false);
	// `beforeSave` closes over creation-time values but runs at FLUSH time, so a
	// captured `useState` value would be permanently stale — read a ref instead.
	const redactRef = useRef(false);

	// Reference-stable plugin instance (plugins are read once, at machine creation).
	const persistence = useMemo(() => {
		const push = (text: string) => {
			const id = `ev-${++evSeq}`;
			setEvents((prev) => [...prev.slice(-19), { id, text }]);
		};

		// `localStorage` survives a full browser restart — that is the point of this
		// demo. Swap in `sessionStorageAdapter` for per-tab state instead.
		const base = localStorageAdapter<RegistrationData>(STORAGE_KEY);

		// Instrumented wrapper: also the smallest possible example of a custom
		// WizardPersistenceAdapter.
		// NOTE: `save`/`clear` always run in a microtask/timer, so calling setState
		// from them is safe. `load()` runs synchronously during render (the machine
		// is constructed in `useWizard`'s render body) — never call setState there.
		const adapter: WizardPersistenceAdapter<RegistrationData> = {
			load: () => base.load(),
			save: (snapshot) => {
				base.save(snapshot);
				push(`save → step "${snapshot.state.currentStepId}"`);
				setPending(false);
				setLastSavedAt(snapshot.savedAt);
				setRawTick((n) => n + 1);
			},
			clear: () => {
				base.clear();
				push("clear");
				setPending(false);
				setLastSavedAt(null);
				setRawTick((n) => n + 1);
			},
		};

		return createPersistencePlugin<RegistrationData>({
			adapter,
			debounceMs: 800, // deliberately long so the debounce is visible
			version: 1,
			flushOnUnload: true, // pagehide flush; harmless with a sync adapter
			// The shared `RegistrationData` has no secret field, so `email` stands in
			// for one here.
			beforeSave: (state) =>
				redactRef.current
					? { ...state, data: { ...state.data, email: "" } }
					: state,
			onRestoreSkipped: (reason) => push(`restore skipped: ${reason}`),
			onRestoreError: (err) => push(`restore error: ${err.message}`),
			onSaveError: (err) => push(`save error: ${err.message}`),
		});
	}, []);

	const plugins = useMemo(() => [persistence], [persistence]);

	const { navigation, actions, state, validation } = useWizard({
		definition: registrationWizard,
		initialData: registrationInitialData,
		plugins,
		// "unsaved changes…" until the debounced write lands.
		onDataChange: () => setPending(true),
	});

	// `ready` settles in a microtask → always after render, so this is StrictMode-safe.
	// The restore callbacks themselves fire DURING render with a synchronous
	// adapter, which is why the banner is driven from here and not from `onRestored`.
	useEffect(() => {
		let alive = true;
		void persistence.ready.then((outcome) => {
			if (!alive) return;
			setRestoreStatus(
				outcome.status === "restored"
					? `restored → step "${outcome.state.currentStepId}"`
					: outcome.status === "skipped"
						? `nothing restored (${outcome.reason})`
						: `restore failed: ${outcome.error.message}`,
			);
		});
		return () => {
			alive = false;
		};
	}, [persistence]);

	const raw = useMemo(() => {
		void rawTick;
		return localStorage.getItem(STORAGE_KEY);
	}, [rawTick]);

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-7xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						Persistence Plugin
					</h1>
					<p className="text-gray-600 mt-2">
						Built-in <code>createPersistencePlugin</code> +{" "}
						<code>localStorageAdapter</code>: auto-restore on mount, debounced
						auto-save, and automatic clearing on complete / reset / cancel. Fill
						in a step, hit <strong>Reload page</strong>.
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

						<div className="flex flex-wrap gap-4 mt-6">
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
							<Button variant="outline" onClick={() => void actions.cancel()}>
								Cancel
							</Button>
							<Button
								variant="outline"
								onClick={() => void persistence.flush()}
							>
								Flush now
							</Button>
							<Button
								variant="outline"
								onClick={() => void persistence.clear()}
							>
								Wipe storage
							</Button>
							<Button
								className="bg-blue-600 hover:bg-blue-700"
								onClick={() => window.location.reload()}
							>
								Reload page
							</Button>
						</div>

						<label className="flex items-center gap-2 mt-4 text-sm text-gray-700">
							<input
								type="checkbox"
								checked={redactEmail}
								onChange={(event) => {
									redactRef.current = event.target.checked;
									setRedactEmail(event.target.checked);
								}}
								className="accent-blue-600"
							/>
							<span>
								Redact email before saving (<code>beforeSave</code>)
							</span>
						</label>

						<p className="text-xs text-gray-500 mt-3">
							After <strong>Submit</strong> the record is cleared and the plugin
							goes inert — <strong>Flush now</strong> /{" "}
							<strong>Wipe storage</strong> become no-ops until you press{" "}
							<strong>Reset</strong>.
						</p>
					</div>

					<div className="bg-white border rounded-lg p-4 shadow-sm space-y-4">
						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Restore</h2>
							<p className="text-sm font-mono text-gray-700 rounded bg-gray-50 border px-2 py-1.5">
								{restoreStatus}
							</p>
						</div>

						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Save status</h2>
							<p
								className={`text-sm font-mono ${
									pending ? "text-amber-600" : "text-green-700"
								}`}
							>
								{pending
									? "unsaved changes…"
									: lastSavedAt
										? `saved ${new Date(lastSavedAt).toLocaleTimeString()}`
										: "nothing saved"}
							</p>
						</div>

						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Raw storage</h2>
							<pre className="max-h-48 overflow-auto text-xs font-mono text-gray-700 rounded bg-gray-50 border p-2 whitespace-pre-wrap break-all">
								{raw ?? "(empty)"}
							</pre>
						</div>

						<div>
							<h2 className="font-semibold text-gray-900 mb-2">Event feed</h2>
							{events.length === 0 ? (
								<p className="text-sm text-gray-500">
									Edit a field or navigate to see adapter writes fire.
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
