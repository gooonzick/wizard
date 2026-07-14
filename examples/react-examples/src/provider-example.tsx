import type { ValidationSummary } from "@gooonzick/wizard-core";
import {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
	WizardProvider,
} from "@gooonzick/wizard-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WizardForm } from "./components/wizard-form";
import { WizardProgress } from "./components/wizard-progress";
import { WizardSidebar } from "./components/wizard-sidebar";
import {
	type RegistrationData,
	registrationFieldLabels,
	registrationInitialData,
	registrationStepIds,
	registrationStepTitles,
	registrationWizard,
} from "./registration-wizard";

/**
 * Nested form that only re-renders on data / validation channel updates.
 */
const ProviderStepForm: React.FC = () => {
	const { data, currentStepId } = useWizardData<RegistrationData>();
	const { validationErrors } = useWizardValidation();
	const { updateField } = useWizardActions<RegistrationData>();

	return (
		<WizardForm
			currentStepId={currentStepId}
			data={data}
			validationErrors={validationErrors}
			onFieldChange={updateField}
		/>
	);
};

/**
 * Navigation controls with isolated navigation + loading subscriptions.
 */
const ProviderControls: React.FC = () => {
	const { canGoNext, canGoPrevious, isLastStep, goNext, goPrevious, goTo } =
		useWizardNavigation();
	const { isNavigating, isSubmitting, isValidating } = useWizardLoading();
	const { submit, validateAll } = useWizardActions<RegistrationData>();
	const [allSummary, setAllSummary] = useState<ValidationSummary | null>(null);

	const handleValidateAll = async () => {
		const summary = await validateAll({ updateStatuses: true });
		setAllSummary(summary);
		if (!summary.valid && summary.firstInvalidStepId) {
			await goTo(summary.firstInvalidStepId, { skipValidation: true });
		}
	};

	return (
		<>
			<div className="flex flex-wrap gap-4 mt-6">
				<Button
					variant="outline"
					onClick={() => goPrevious()}
					disabled={!canGoPrevious || isNavigating}
				>
					Previous
				</Button>

				{!isLastStep ? (
					<Button
						onClick={() => goNext()}
						disabled={!canGoNext || isNavigating}
					>
						Next
					</Button>
				) : (
					<>
						<Button
							variant="outline"
							onClick={handleValidateAll}
							disabled={isValidating || isNavigating}
						>
							Validate all
						</Button>
						<Button
							onClick={() => submit()}
							disabled={isNavigating || isSubmitting}
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
		</>
	);
};

/**
 * Progress + sidebar subscribe only to the channels they need.
 */
const ProviderChrome: React.FC = () => {
	const { data, currentStepId, stepStatuses, progress } =
		useWizardData<RegistrationData>();
	const { goTo } = useWizardNavigation();

	return (
		<>
			<WizardProgress
				progress={progress}
				stepTitles={registrationStepTitles}
				stepStatuses={stepStatuses}
				onStepClick={(stepId) => goTo(stepId)}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
				<div>
					<ProviderStepForm />
					<ProviderControls />
				</div>

				<WizardSidebar
					data={data}
					currentStepId={currentStepId}
					stepIds={registrationStepIds}
					stepTitles={registrationStepTitles}
					stepStatuses={stepStatuses}
					fieldLabels={registrationFieldLabels}
					onStepClick={(stepId) => goTo(stepId)}
				/>
			</div>
		</>
	);
};

export const ProviderExample: React.FC = () => {
	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-7xl mx-auto">
				<div className="mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						Registration Wizard (Provider + Granular Hooks)
					</h1>
					<p className="text-gray-600 mt-2">
						<code>WizardProvider</code> with <code>useWizardData</code>,{" "}
						<code>useWizardNavigation</code>, <code>useWizardValidation</code>,{" "}
						<code>useWizardLoading</code>, and <code>useWizardActions</code> in
						nested components
					</p>
				</div>

				<WizardProvider
					definition={registrationWizard}
					initialData={registrationInitialData}
					onComplete={(finalData) => {
						console.log(
							`Wizard Completed (Provider)! Data: ${JSON.stringify(finalData, null, 2)}`,
						);
					}}
				>
					<ProviderChrome />
				</WizardProvider>
			</div>
		</div>
	);
};
