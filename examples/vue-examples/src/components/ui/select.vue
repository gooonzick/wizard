<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface SelectItem {
	value: string;
	label: string;
}

interface Props {
	modelValue?: string;
	items?: SelectItem[];
	placeholder?: string;
	disabled?: boolean;
	class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
	items: () => [],
	placeholder: "Select...",
	disabled: false,
});

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const _selectClasses = computed(() =>
	cn(
		"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		props.class,
	),
);

const _handleChange = (event: Event) => {
	const target = event.target as HTMLSelectElement;
	emit("update:modelValue", target.value);
};
</script>

<template>
	<select
		:class="selectClasses"
		:value="modelValue"
		:disabled="disabled"
		@change="handleChange"
	>
		<option v-if="placeholder && !modelValue" value="" disabled selected>
			{{ placeholder }}
		</option>
		<option v-for="item in items" :key="item.value" :value="item.value">
			{{ item.label }}
		</option>
	</select>
</template>
