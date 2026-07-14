<script setup lang="ts">
import {
	createLoggingPlugin,
	type WizardPlugin,
} from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import WizardForm from "@/components/wizard-form.vue";
import WizardProgress from "@/components/wizard-progress.vue";
import type { RegistrationData } from "../types/wizard-data";
import { stepTitles } from "./constants";
import { initialData } from "./initial-data";
import { advancedWizard } from "./wizard-definition";

type PluginLogEntry = { id: string; text: string };

let pluginLogSeq = 0;
const events = ref<PluginLogEntry[]>([]);

const push = (text: string) => {
	const id = `log-${++pluginLogSeq}`;
	events.value = [...events.value.slice(-19), { id, text }];
};

// Reference-stable — read once at machine creation (not reactive).
const plugins: WizardPlugin<RegistrationData>[] = [
	createLoggingPlugin<RegistrationData>({ level: "debug" }),
	{
		name: "event-log",
		afterTransition(e) {
			push(`${e.type}: ${e.fromStepId} → ${e.toStepId}`);
		},
		onError(error, ctx) {
			push(`error(${ctx.phase}): ${error.message}`);
		},
		onReset() {
			push("reset");
		},
	},
];

const { navigation, actions, state, validation } = useWizard({
	definition: advancedWizard,
	initialData,
	plugins,
	onComplete: (finalData) => {
		console.log("Wizard Completed (plugins)!", finalData);
		alert("Wizard completed! Check console for data.");
	},
});
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-7xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Plugins Demo</h1>
				<p class="text-gray-600 mt-2">
					<code>createLoggingPlugin</code> + a custom
					<code>afterTransition</code> / <code>onError</code> plugin. Check the
					browser console for structured logs.
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
					</div>
				</Card>

				<div class="bg-white border rounded-lg p-4 shadow-sm">
					<h2 class="font-semibold text-gray-900 mb-2">Plugin event log</h2>
					<p v-if="events.length === 0" class="text-sm text-gray-500">
						Navigate the wizard to see plugin hooks fire.
					</p>
					<ul
						v-else
						class="space-y-1 text-sm font-mono text-gray-700 max-h-80 overflow-y-auto"
					>
						<li v-for="entry in events" :key="entry.id">
							{{ entry.text }}
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</template>
