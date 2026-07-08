<script setup lang="ts">
import type { ValidationSummary } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import WizardForm from "@/components/wizard-form.vue";
import WizardProgress from "@/components/wizard-progress.vue";
import WizardSidebar from "@/components/wizard-sidebar.vue";
import { fieldLabels, stepIds, stepTitles } from "./constants";
import { initialData } from "./initial-data";
import { advancedWizard } from "./wizard-definition";

const { navigation, actions, state, validation } = useWizard({
	definition: advancedWizard,
	initialData,
	onComplete: (finalData) => {
		console.log("Wizard Completed!", finalData);
		alert("Wizard completed! Check console for data.");
	},
});

// Review-step demo: validate every step at once and jump to the first invalid.
const allSummary = ref<ValidationSummary | null>(null);
const handleValidateAll = async () => {
	const summary = await actions.validateAll({ updateStatuses: true });
	allSummary.value = summary;
	if (!summary.valid && summary.firstInvalidStepId) {
		navigation.goTo(summary.firstInvalidStepId, { skipValidation: true });
	}
};
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-7xl mx-auto">
			<!-- Header -->
			<h1 class="text-4xl font-bold text-gray-900 mb-2">
				Advanced Vue Wizard
			</h1>
			<p class="text-gray-600 mb-6">
				Demonstration of sync transitions, complex validation, custom guards
			</p>

			<!-- Progress -->
			<WizardProgress
				:progress="state.progress.value"
				:step-titles="stepTitles"
				:step-statuses="state.stepStatuses.value"
			/>

			<!-- Main Content -->
			<div class="lg:grid-cols-[1fr_350px] grid gap-6 mt-6">
				<!-- Left Column - Form -->
				<Card class="p-8">
					<WizardForm
						:current-step-id="state.currentStepId.value"
						:data="state.data.value"
						:validation-errors="validation.validationErrors.value"
						:on-field-change="actions.updateField"
					/>

					<!-- Controls -->
					<div class="flex gap-4 mt-6">
						<Button
							variant="outline"
							@click="navigation.goPrevious"
							:disabled="!navigation.canGoPrevious.value"
						>
							Previous
						</Button>

						<template v-if="!navigation.isLastStep.value">
							<Button
								@click="navigation.goNext"
								:disabled="!navigation.canGoNext.value"
							>
								Next
							</Button>
						</template>
						<template v-else>
							<Button variant="outline" @click="handleValidateAll">
								Validate all
							</Button>
							<Button
								@click="actions.submit"
								class="bg-green-600 hover:bg-green-700"
							>
								Submit
							</Button>
						</template>
					</div>

					<p
						v-if="allSummary && !allSummary.valid"
						class="text-sm text-red-600 mt-2"
					>
						Invalid steps: {{ allSummary.invalidStepIds.join(", ") }}
					</p>
				</Card>

				<!-- Right Column - Sidebar -->
				<WizardSidebar
					:data="state.data.value"
					:current-step-id="state.currentStepId.value"
					:step-ids="stepIds"
					:step-titles="stepTitles"
					:field-labels="fieldLabels"
				/>
			</div>
		</div>
	</div>
</template>
