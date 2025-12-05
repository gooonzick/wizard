import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { WizardForm } from "./components/wizard-form";
import { WizardProgress } from "./components/wizard-progress";
import { WizardSidebar } from "./components/wizard-sidebar";

// 1. Define Data Type
export type RegistrationData = {
	firstName: string;
	lastName: string;
	email: string;
	newsletter: boolean;
	theme: "light" | "dark";
};

// 2. Define Wizard
const registrationWizard = createWizard<RegistrationData>("registration")
	.initialStep("personal")
	.step("personal", (step) =>
		step
			.title("Personal Information")
			.required("firstName", "lastName", "email")
			.next("preferences"),
	)
	.step("preferences", (step) =>
		step.title("Preferences").next("review").previous("personal"),
	)
	.step("review", (step) =>
		step
			.title("Review")
			.description("Please review your information")
			.previous({
				type: "resolver",
				resolve: (data) => (data.newsletter ? "preferences" : "personal"),
			}),
	)
	.build();

const initialData: RegistrationData = {
	firstName: "",
	lastName: "",
	email: "",
	newsletter: false,
	theme: "light",
};

// Field labels for sidebar display
const fieldLabels: Record<string, string> = {
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	newsletter: "Newsletter",
	theme: "Theme",
};

// 3. Component
export const WizardExample: React.FC = () => {
	const { navigation, actions, state, validation } = useWizard({
		definition: registrationWizard,
		initialData,
		onComplete: (finalData) => {
			console.log(
				`Wizard Completed! Data: ${JSON.stringify(finalData, null, 2)}`,
			);
		},
	});

	const stepIds = ["personal", "preferences", "review"];
	const stepTitles: Record<string, string> = {
		personal: "Personal",
		preferences: "Preferences",
		review: "Review",
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
					currentStepId={state.currentStep.id}
					stepIds={stepIds}
					stepTitles={stepTitles}
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
								<Button
									onClick={() => actions.submit()}
									className="bg-green-600 hover:bg-green-700"
								>
									Submit
								</Button>
							)}
						</div>
					</div>

					{/* Sidebar */}
					<WizardSidebar
						data={state.data}
						currentStepId={state.currentStep.id}
						stepIds={stepIds}
						stepTitles={stepTitles}
						fieldLabels={fieldLabels}
					/>
				</div>
			</div>
		</div>
	);
};
