<script setup lang="ts">
import { WizardProvider } from '@gooonzick/wizard-vue';

const handleComplete = (finalData: unknown) => {
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

			<WizardProvider
				:definition="advancedWizard"
				:initial-data="initialData"
				@on-complete="handleComplete"
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
			</WizardProvider>
		</div>
	</div>
</template>
