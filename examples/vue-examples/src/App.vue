<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import ApproachToggle from "./components/approach-toggle.vue";
import FieldBindingExample from "./wizard-example/field-binding-example.vue";
import HistoryExample from "./wizard-example/history-example.vue";
import ProviderExample from "./wizard-example/provider-example.vue";
import ResetCancelExample from "./wizard-example/reset-cancel-example.vue";
import StatePersistenceExample from "./wizard-example/state-persistence-example.vue";
import UseWizardExample from "./wizard-example/use-wizard-example.vue";

type Approach =
	| "use-wizard"
	| "provider"
	| "field-binding"
	| "history"
	| "reset-cancel"
	| "persistence";

const approaches: Approach[] = [
	"use-wizard",
	"provider",
	"field-binding",
	"history",
	"reset-cancel",
	"persistence",
];

const approach = ref<Approach>("use-wizard");

onMounted(() => {
	const saved = localStorage.getItem("wizard-approach");
	if (saved && approaches.includes(saved as Approach)) {
		approach.value = saved as Approach;
	}
});

watch(approach, (newVal) => {
	localStorage.setItem("wizard-approach", newVal);
});
</script>

<template>
	<div class="min-h-screen bg-gray-50">
		<div class="max-w-7xl mx-auto py-8 px-4">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Vue Wizard Examples</h1>
				<p class="text-gray-600 mt-2">
					Demonstration of @gooonzick/wizard-vue adapter
				</p>
			</div>

			<ApproachToggle v-model="approach" class="mb-6" />

			<UseWizardExample v-if="approach === 'use-wizard'" />
			<ProviderExample v-else-if="approach === 'provider'" />
			<FieldBindingExample v-else-if="approach === 'field-binding'" />
			<HistoryExample v-else-if="approach === 'history'" />
			<ResetCancelExample v-else-if="approach === 'reset-cancel'" />
			<StatePersistenceExample v-else />
		</div>
	</div>
</template>
