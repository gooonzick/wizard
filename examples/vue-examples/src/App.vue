<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import UseWizardExample from "./wizard-example/use-wizard-example.vue";
import ProviderExample from "./wizard-example/provider-example.vue";

const approach = ref<"use-wizard" | "provider">("use-wizard");

onMounted(() => {
	const saved = localStorage.getItem("wizard-approach");
	if (saved === "use-wizard" || saved === "provider") {
		approach.value = saved;
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
			<ProviderExample v-else />
		</div>
	</div>
</template>
