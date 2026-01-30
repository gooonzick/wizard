<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { CheckCircle, Circle } from "lucide-vue-next";
import { ref, watch } from "vue";

interface Props {
	modelValue?: boolean;
	disabled?: boolean;
	id?: string;
}

const props = withDefaults(defineProps<Props>(), {
	modelValue: false,
	disabled: false,
});

const emit = defineEmits<{
	"update:modelValue": [value: boolean];
}>();

const isChecked = ref(props.modelValue);

watch(
	() => props.modelValue,
	(newValue) => {
		isChecked.value = newValue;
	},
);

const handleClick = () => {
	if (props.disabled) return;
	isChecked.value = !isChecked.value;
	emit("update:modelValue", isChecked.value);
};
</script>

<template>
	<div class="flex items-center gap-2">
		<button
			:id="id"
			type="button"
			:disabled="disabled"
			@click="handleClick"
			:class="[
				'flex items-center justify-center rounded-md border transition-colors',
				isChecked
					? 'border-primary bg-primary/10 text-primary'
					: 'border-input bg-background text-muted-foreground hover:bg-accent',
				disabled && 'cursor-not-allowed opacity-50',
			]"
			:aria-checked="isChecked"
			role="checkbox"
		>
			<CheckCircle v-if="isChecked" class="h-4 w-4" />
			<Circle v-else class="h-4 w-4" />
		</button>
		<label
			v-if="$slots.default"
			:for="id"
			:class="[
				'text-sm cursor-pointer',
				disabled && 'cursor-not-allowed opacity-50',
			]"
			@click="handleClick"
		>
			<slot />
		</label>
	</div>
</template>
