<script setup lang="ts">
import { createAnalyticsPlugin } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { computed, ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import WizardForm from "@/components/wizard-form.vue";
import WizardProgress from "@/components/wizard-progress.vue";
import type { RegistrationData } from "../types/wizard-data";
import { stepTitles } from "./constants";
import { initialData } from "./initial-data";
import { advancedWizard } from "./wizard-definition";

// Demo of the WIZ-016 built-in analytics plugin: per-step timing, backtrack
// counting, and a live getReport() snapshot.
type EventEntry = { id: string; text: string };

let analyticsSeq = 0;
const events = ref<EventEntry[]>([]);
const reportTick = ref(0);

const push = (text: string) => {
	const id = `ev-${++analyticsSeq}`;
	events.value = [...events.value.slice(-19), { id, text }];
	reportTick.value += 1;
};

// Reference-stable — read once at machine creation (not reactive).
const analytics = createAnalyticsPlugin<RegistrationData>({
	onStepView: (stepId) => push(`view: ${stepId}`),
	onStepComplete: (stepId, ms) => push(`complete: ${stepId} (${ms}ms)`),
	onBacktrack: (from, to) => push(`backtrack: ${from} → ${to}`),
	onWizardComplete: (_data, total) => push(`wizard complete (${total}ms total)`),
	onDropOff: (stepId, ms) => push(`drop-off: ${stepId} (${ms}ms)`),
});

const plugins = [analytics];

const { navigation, actions, state, validation } = useWizard({
	definition: advancedWizard,
	initialData,
	plugins,
});

// reportTick is a dependency so the panel recomputes after each callback / manual refresh.
const report = computed(() => {
	void reportTick.value;
	return analytics.getReport();
});
const stepTimingEntries = computed(() => Object.entries(report.value.stepTimings));
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-7xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Analytics Plugin</h1>
				<p class="text-gray-600 mt-2">
					Built-in <code>createAnalyticsPlugin</code>: per-step timing,
					backtrack counting, and a live <code>getReport()</code> snapshot.
				</p>
			</div>

			<WizardProgress
				:progress="state.progress.value"
				:step-titles="stepTitles"
				:step-statuses="state.stepStatuses.value"
			/>

			<div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">
				<Card class="p-8">
					<WizardForm
						:current-step-id="state.currentStepId.value"
						:data="state.data.value"
						:validation-errors="validation.validationErrors.value"
						:on-field-change="actions.updateField"
					/>

					<div class="flex flex-wrap gap-4 mt-6">
						<Button
							variant="outline"
							:disabled="!navigation.canGoPrevious.value"
							@click="navigation.goPrevious"
						>
							Previous
						</Button>
						<template v-if="!navigation.isLastStep.value">
							<Button
								:disabled="!navigation.canGoNext.value"
								@click="navigation.goNext"
							>
								Next
							</Button>
						</template>
						<template v-else>
							<Button
								class="bg-green-600 hover:bg-green-700"
								@click="actions.submit"
							>
								Submit
							</Button>
						</template>
						<Button variant="outline" @click="actions.reset()">
							Reset
						</Button>
						<Button variant="outline" @click="reportTick += 1">
							Refresh report
						</Button>
					</div>
				</Card>

				<div class="bg-white border rounded-lg p-4 shadow-sm space-y-4">
					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Report</h2>
						<dl class="text-sm text-gray-700 space-y-1">
							<div class="flex justify-between">
								<dt>Current step</dt>
								<dd class="font-mono">{{ report.currentStep ?? "—" }}</dd>
							</div>
							<div class="flex justify-between">
								<dt>Backtracks</dt>
								<dd class="font-mono">{{ report.backtrackCount }}</dd>
							</div>
							<div class="flex justify-between">
								<dt>Total (ms)</dt>
								<dd class="font-mono">{{ report.totalDuration }}</dd>
							</div>
							<div class="flex justify-between">
								<dt>Completed</dt>
								<dd class="font-mono">{{ String(report.completed) }}</dd>
							</div>
						</dl>
						<h3 class="font-medium text-gray-800 mt-3 mb-1">
							Step timings (ms)
						</h3>
						<ul class="text-sm font-mono text-gray-700 space-y-1">
							<li
								v-for="[id, ms] in stepTimingEntries"
								:key="id"
								class="flex justify-between"
							>
								<span>{{ id }}</span>
								<span>{{ ms }}</span>
							</li>
						</ul>
					</div>

					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Event feed</h2>
						<p v-if="events.length === 0" class="text-sm text-gray-500">
							Navigate the wizard to see analytics callbacks fire.
						</p>
						<ul
							v-else
							class="space-y-1 text-sm font-mono text-gray-700 max-h-64 overflow-y-auto"
						>
							<li v-for="entry in events" :key="entry.id">
								{{ entry.text }}
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
