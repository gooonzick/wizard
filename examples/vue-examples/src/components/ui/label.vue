<script setup lang="ts">
import type { HTMLAttributes } from "vue";

interface Props {
	for?: string;
	class?: HTMLAttributes["class"];
}

defineProps<Props>();
</script>

<template>
	<label :for="for" :class="cn('block mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', $props.class)">
		<slot />
	</label>
</template>
