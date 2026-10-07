import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
import { lazyInitialData } from "./lazy-steps/types";

function LazyStepsWizard({ onRecreate }: { onRecreate: () => void }) {
	const [loadError, setLoadError] = useState<string | null>(null);
	const [failureArmed, setFailureArmed] = useState(false);
	// One definition per wizard instance, so recreating also resets the demo flag.
	const [definition] = useState(() => createLazyStepsWizard());
	const { state, navigation, validation, loading, actions } = useWizard({
		definition,
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				// The message already includes the cause.
				setLoadError(`${error.message} — click Next to retry.`);
				setFailureArmed(false);
			}
		},
		onStepEnter: () => setLoadError(null),
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const step = state.currentStep;
	const next = () => {
		setLoadError(null);
		void navigation.goNext().catch(() => {});
	};

	return (
		<Card className="p-8 space-y-4">
			<div>
				<h2 className="text-xl font-semibold">{step.meta?.title}</h2>
				<p className="text-sm text-gray-500">{step.meta?.description}</p>
			</div>

			{loading.isLoadingStep && (
				<p role="status" className="text-sm text-blue-600 animate-pulse">
					Loading step implementation…
				</p>
			)}
			{loadError && (
				<p role="alert" className="text-sm text-red-600">
					{loadError}
				</p>
			)}

			{state.currentStepId === "account" && (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">Email</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={state.data.email}
						onChange={(e) => actions.updateField("email", e.target.value)}
						placeholder="ada@example.com"
					/>
				</label>
			)}
			{state.currentStepId === "documents" && (
				<label className="block">
					<span className="text-sm font-medium text-gray-700">
						Passport number
					</span>
					<input
						className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
						value={state.data.passport}
						onChange={(e) => actions.updateField("passport", e.target.value)}
						placeholder="AB1234567"
					/>
				</label>
			)}
			{state.currentStepId === "summary" && (
				<pre className="rounded bg-gray-100 p-3 text-xs">
					{JSON.stringify(state.data, null, 2)}
				</pre>
			)}

			{validation.validationErrors &&
				Object.entries(validation.validationErrors).map(([field, msg]) => (
					<p key={field} className="text-sm text-red-600">
						{msg}
					</p>
				))}

			<div className="flex flex-wrap gap-3">
				<Button
					variant="outline"
					onClick={() => void navigation.goPrevious().catch(() => {})}
					disabled={!navigation.canGoPrevious || loading.isNavigating}
				>
					Back
				</Button>
				{navigation.isLastStep ? (
					<Button onClick={() => void actions.submit().catch(() => {})}>
						Finish
					</Button>
				) : (
					<Button
						onClick={next}
						// Prefetch the lazy step while the user is about to click.
						// Skipped while a failure is armed: a silent preload would consume it.
						onMouseEnter={() => {
							if (state.currentStepId === "account" && !failureArmed) {
								void actions.preloadStep("documents");
							}
						}}
						disabled={loading.isNavigating}
					>
						{loading.isLoadingStep ? "Loading…" : "Next"}
					</Button>
				)}
			</div>

			<div className="flex flex-wrap gap-3 border-t pt-4 text-sm">
				<Button
					variant="outline"
					onClick={() => {
						armLoadFailure();
						setFailureArmed(true);
					}}
				>
					{failureArmed ? "Next load will fail" : "Fail next load"}
				</Button>
				<Button variant="outline" onClick={onRecreate}>
					Recreate wizard (forget loaded steps)
				</Button>
			</div>
			<p className="text-xs text-gray-500">
				A loaded step is cached per wizard. Hovering “Next” on the first step
				prefetches it with <code>preloadStep</code>, so usually no spinner
				appears. “Fail next load” only matters before the step has loaded once —
				recreate the wizard to try it again.
			</p>
		</Card>
	);
}

export const LazyStepsExample: React.FC = () => {
	const [generation, setGeneration] = useState(0);
	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-3xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900">Lazy Steps</h1>
				<p className="text-gray-600 mt-1 mb-6">
					The Documents step loads its validation and lifecycle code on demand
					(WIZ-013).
				</p>
				<LazyStepsWizard
					key={generation}
					onRecreate={() => setGeneration((g) => g + 1)}
				/>
			</div>
		</div>
	);
};
