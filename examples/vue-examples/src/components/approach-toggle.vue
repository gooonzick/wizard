<script setup lang="ts">
import { cn } from "@/lib/utils";
import Button from "./ui/button.vue";

interface Props {
	modelValue: "use-wizard" | "provider";
	class?: string;
}

const props = withDefaults(defineProps<Props>(), {
	class: "",
});

defineEmits<
	(event: "update:modelValue", value: "use-wizard" | "provider") => void
>();
</script>

<template>
	<div :class="cn('inline-flex items-center gap-2', props.class)">
		<Button
			:variant="modelValue === 'use-wizard' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'use-wizard')"
		>
			useWizard
		</Button>
		<Button
			:variant="modelValue === 'provider' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'provider')"
		>
			Provider
		</Button>
	</div>
</template>
