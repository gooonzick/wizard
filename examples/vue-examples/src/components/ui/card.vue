<script setup lang="ts">
import type { HTMLAttributes } from "vue";

interface Props {
	class?: HTMLAttributes["class"];
}

defineProps<Props>();
</script>

<template>
	<div :class="cn('p-6 border rounded-md shadow-sm bg-card', $props.class)">
		<slot />
	</div>
</template>
