<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
	htmlFor?: string;
	class?: HTMLAttributes["class"];
}

defineProps<Props>();
</script>

<template>
	<label :for="htmlFor" :class="cn('block mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', $props.class)">
		<slot />
	</label>
</template>
