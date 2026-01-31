<script setup lang="ts">
import {
	useWizardActions,
	useWizardLoading,
	useWizardNavigation,
} from "@gooonzick/wizard-vue";
import Button from "@/components/ui/button.vue";

const { canGoNext, canGoPrevious, isLastStep, goNext, goPrevious } =
	useWizardNavigation();
const { isNavigating, isSubmitting } = useWizardLoading();
const { submit } = useWizardActions();
</script>

<template>
	<div class="flex gap-4 mt-6">
		<Button
			variant="outline"
			@click="goPrevious"
			:disabled="!canGoPrevious.value || isNavigating.value"
		>
			Previous
		</Button>

		<template v-if="!isLastStep">
			<Button
				@click="goNext"
				:disabled="!canGoNext.value || isNavigating.value"
			>
				Next
			</Button>
		</template>
		<template v-else>
			<Button
				@click="submit"
				:disabled="isNavigating.value || isSubmitting.value"
				class="bg-green-600 hover:bg-green-700"
			>
				Submit
			</Button>
		</template>
	</div>
</template>
