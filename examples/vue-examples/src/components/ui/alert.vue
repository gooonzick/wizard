<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { AlertCircle } from "lucide-vue-next";
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
	variant?: "default" | "destructive";
	class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
	variant: "default",
});

const slots = defineSlots<{
	default?: () => unknown;
	title?: () => unknown;
}>();

const variantClasses = computed(() => {
	const variants = {
		default: "border bg-background text-foreground",
		destructive: "border-destructive/50 text-destructive",
	};
	return variants[props.variant];
});

const hasTitle = computed(() => !!slots.title);
</script>

<template>
	<div :class="cn('relative w-full rounded-lg border p-4', variantClasses, props.class)" role="alert">
		<div class="flex items-start gap-3">
			<AlertCircle class="h-4 w-4 mt-0.5" />
			<div class="flex-1 space-y-1">
				<h5 v-if="hasTitle" class="font-medium leading-none tracking-tight">
					<slot name="title" />
				</h5>
				<div v-if="$slots.default" class="text-sm">
					<slot />
				</div>
			</div>
		</div>
	</div>
</template>
