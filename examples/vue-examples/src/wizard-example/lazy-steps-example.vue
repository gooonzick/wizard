<script setup lang="ts">
import { ref } from "vue";
import LazyStepsWizard from "./lazy-steps-wizard.vue";

const generation = ref(0);
</script>

<template>
	<div class="py-2">
		<h1 class="text-3xl font-bold text-gray-900">Lazy Steps</h1>
		<p class="text-gray-600 mt-1 mb-6">
			The Documents step loads its validation and lifecycle code on demand
			(WIZ-013).
		</p>
		<LazyStepsWizard :key="generation" @recreate="generation++" />
	</div>
</template>
