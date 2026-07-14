import type { ValidationSummary } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WizardForm } from "./components/wizard-form";
import { WizardProgress } from "./components/wizard-progress";
import { WizardSidebar } from "./components/wizard-sidebar";
import {
	registrationFieldLabels,
	registrationInitialData,
	registrationStepIds,
	registrationStepTitles,
	registrationWizard,
} from "./registration-wizard";

// Re-export type for components that import from this module historically.
export type { RegistrationData } from "./registration-wizard";

export const WizardExample: React.FC = () => {
	const { navigation, actions, state, validation } = useWizard({
		definition: registrationWizard,
		initialData: registrationInitialData,
		onComplete: (finalData) => {
			console.log(
				`Wizard Completed! Data: ${JSON.stringify(finalData, null, 2)}`,
			);
		},
	});

	// Review-step demo: validate every step at once and jump to the first invalid.
	const [allSummary, setAllSummary] = useState<ValidationSummary | null>(null);

	const handleValidateAll = async () => {
		const summary = await actions.validateAll({ updateStatuses: true });
		setAllSummary(summary);
		if (!summary.valid && summary.firstInvalidStepId) {
			navigation.goTo(summary.firstInvalidStepId, { skipValidation: true });
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						Registration Wizard
					</h1>
					<p className="text-gray-600 mt-2">
						Complete your profile in a few easy steps
					</p>
				</div>

				{/* Progress */}
				<WizardProgress
					progress={state.progress}
					stepTitles={registrationStepTitles}
					stepStatuses={state.stepStatuses}
					onStepClick={(stepId) => navigation.goTo(stepId)}
				/>

				{/* Main Content */}
				<div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
					{/* Form */}
					<div>
						<WizardForm
							currentStepId={state.currentStep.id}
							data={state.data}
							validationErrors={validation.validationErrors}
							onFieldChange={actions.updateField}
						/>

						{/* Controls */}
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
								<>
									<Button variant="outline" onClick={handleValidateAll}>
										Validate all
									</Button>
									<Button
										onClick={() => actions.submit()}
										className="bg-green-600 hover:bg-green-700"
									>
										Submit
									</Button>
								</>
							)}
						</div>

						{allSummary && !allSummary.valid && (
							<p className="text-sm text-red-600 mt-2">
								Invalid steps: {allSummary.invalidStepIds.join(", ")}
							</p>
						)}
					</div>

					{/* Sidebar */}
					<WizardSidebar
						data={state.data}
						currentStepId={state.currentStep.id}
						stepIds={registrationStepIds}
						stepTitles={registrationStepTitles}
						stepStatuses={state.stepStatuses}
						fieldLabels={registrationFieldLabels}
						onStepClick={(stepId) => navigation.goTo(stepId)}
					/>
				</div>
			</div>
		</div>
	);
};
