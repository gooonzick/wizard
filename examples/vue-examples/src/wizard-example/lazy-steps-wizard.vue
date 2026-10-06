<script setup lang="ts">
import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import {
	armLoadFailure,
	createLazyStepsWizard,
} from "../lazy-steps/definition";
import { lazyInitialData } from "../lazy-steps/types";

const emit = defineEmits<(event: "recreate") => void>();

const loadError = ref<string | null>(null);
const failureArmed = ref(false);

const { state, navigation, validation, loading, actions } = useWizard({
	definition: createLazyStepsWizard(),
	initialData: lazyInitialData,
	onError: (error) => {
		if (error instanceof WizardStepLoadError) {
			const cause = error.cause instanceof Error ? error.cause.message : "";
			loadError.value = `${error.message}${cause ? ` — ${cause}` : ""} — click Next to retry.`;
			failureArmed.value = false;
		}
	},
	onStepEnter: () => {
		loadError.value = null;
	},
	onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
});

function next() {
	loadError.value = null;
	void navigation.goNext().catch(() => {});
}

function prefetch() {
	// Skipped while a failure is armed: a silent preload would consume it.
	if (state.currentStepId.value === "account" && !failureArmed.value) {
		void actions.preloadStep("documents").catch(() => {});
	}
}

function armFailure() {
	armLoadFailure();
	failureArmed.value = true;
}
</script>

<template>
	<Card class="p-8 space-y-4">
		<div>
			<h2 class="text-xl font-semibold">{{ state.currentStep.value.meta?.title }}</h2>
			<p class="text-sm text-gray-500">
				{{ state.currentStep.value.meta?.description }}
			</p>
		</div>

		<p v-if="loading.isLoadingStep.value" role="status" class="text-sm text-blue-600 animate-pulse">
			Loading step implementation…
		</p>
		<p v-if="loadError" role="alert" class="text-sm text-red-600">{{ loadError }}</p>

		<label v-if="state.currentStepId.value === 'account'" class="block">
			<span class="text-sm font-medium text-gray-700">Email</span>
			<input
				:value="state.data.value.email"
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
				placeholder="ada@example.com"
				@input="actions.updateField('email', ($event.target as HTMLInputElement).value)"
			/>
		</label>
		<label v-else-if="state.currentStepId.value === 'documents'" class="block">
			<span class="text-sm font-medium text-gray-700">Passport number</span>
			<input
				:value="state.data.value.passport"
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
				placeholder="AB1234567"
				@input="actions.updateField('passport', ($event.target as HTMLInputElement).value)"
			/>
		</label>
		<pre v-else class="rounded bg-gray-100 p-3 text-xs">{{ JSON.stringify(state.data.value, null, 2) }}</pre>

		<p
			v-for="(msg, field) in validation.validationErrors.value"
			:key="field"
			class="text-sm text-red-600"
		>
			{{ msg }}
		</p>

		<div class="flex flex-wrap gap-3">
			<Button
				variant="outline"
				:disabled="!navigation.canGoPrevious.value || loading.isNavigating.value"
				@click="navigation.goPrevious().catch(() => {})"
			>
				Back
			</Button>
			<Button
				v-if="navigation.isLastStep.value"
				@click="actions.submit().catch(() => {})"
			>
				Finish
			</Button>
			<Button
				v-else
				:disabled="loading.isNavigating.value"
				@click="next"
				@mouseenter="prefetch"
			>
				{{ loading.isLoadingStep.value ? "Loading…" : "Next" }}
			</Button>
		</div>

		<div class="flex flex-wrap gap-3 border-t pt-4 text-sm">
			<Button variant="outline" @click="armFailure">
				{{ failureArmed ? "Next load will fail" : "Fail next load" }}
			</Button>
			<Button variant="outline" @click="emit('recreate')">
				Recreate wizard (forget loaded steps)
			</Button>
		</div>
		<p class="text-xs text-gray-500">
			A loaded step is cached per wizard. Hovering “Next” on the first step
			prefetches it with <code>preloadStep</code>, so usually no spinner appears.
			“Fail next load” only matters before the step has loaded once — recreate
			the wizard to try it again.
		</p>
	</Card>
</template>
