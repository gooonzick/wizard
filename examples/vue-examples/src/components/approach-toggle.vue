<script setup lang="ts">
import { cn } from "@/lib/utils";
import Button from "./ui/button.vue";

type Approach =
	| "use-wizard"
	| "provider"
	| "field-binding"
	| "history"
	| "reset-cancel";

interface Props {
	modelValue: Approach;
	class?: string;
}

const props = withDefaults(defineProps<Props>(), {
	class: "",
});

defineEmits<
	(event: "update:modelValue", value: Approach) => void
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
		<Button
			:variant="modelValue === 'field-binding' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'field-binding')"
		>
			useWizardField
		</Button>
		<Button
			:variant="modelValue === 'history' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'history')"
		>
			History Stack
		</Button>
		<Button
			:variant="modelValue === 'reset-cancel' ? 'default' : 'outline'"
			@click="$emit('update:modelValue', 'reset-cancel')"
		>
			Reset & Cancel
		</Button>
	</div>
</template>
