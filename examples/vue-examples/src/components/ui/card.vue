<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

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
