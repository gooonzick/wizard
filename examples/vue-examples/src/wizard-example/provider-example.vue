<script setup lang="ts">
import { createTypedWizardProvider } from "@gooonzick/wizard-vue";
import type { RegistrationData } from "../types/wizard-data";
import { initialData } from "./initial-data";
import WizardControls from "./wizard-controls.vue";
import { advancedWizard } from "./wizard-definition";
import WizardSidebar from "./wizard-sidebar.vue";
import WizardStepForm from "./wizard-step-form.vue";

const { Provider } = createTypedWizardProvider<RegistrationData>();

const handleComplete = (finalData: RegistrationData) => {
	console.log("Wizard Completed (Provider)!", finalData);
	alert("Wizard completed! Check console for data.");
};
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-7xl mx-auto">
			<!-- Header -->
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">
					Vue Wizard (Provider + Granular Hooks)
				</h1>
				<p class="text-gray-600 mt-2">
					Demonstration of WizardProvider with isolated component subscriptions
				</p>
			</div>

			<Provider
				:definition="advancedWizard"
				:initial-data="initialData"
				:on-complete="handleComplete"
			>
				<div class="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
					<!-- Left Column -->
					<div>
						<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
							<WizardStepForm />
							<WizardControls />
						</div>
					</div>

					<!-- Right Column -->
					<div>
						<WizardSidebar />
					</div>
				</div>
			</Provider>
		</div>
	</div>
</template>
