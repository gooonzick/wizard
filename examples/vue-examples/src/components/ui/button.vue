<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
	variant?:
		| "default"
		| "destructive"
		| "outline"
		| "secondary"
		| "ghost"
		| "link";
	size?: "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg";
	disabled?: boolean;
	class?: HTMLAttributes["class"];
	asChild?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	variant: "default",
	size: "default",
	disabled: false,
	asChild: false,
});

const variantClasses = computed(() => {
	const variants = {
		default: "bg-primary text-primary-foreground hover:bg-primary/90",
		destructive:
			"bg-destructive text-destructive-foreground hover:bg-destructive/90",
		outline:
			"border border-input bg-background hover:bg-accent hover:text-accent-foreground",
		secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
		ghost: "hover:bg-accent hover:text-accent-foreground",
		link: "text-primary underline-offset-4 hover:underline",
	};
	return variants[props.variant];
});

const sizeClasses = computed(() => {
	const sizes = {
		default: "h-10 px-4 py-2",
		sm: "h-9 rounded-md px-3",
		lg: "h-11 rounded-md px-8",
		icon: "h-10 w-10",
		"icon-sm": "h-9 w-9",
		"icon-lg": "h-11 w-11",
	};
	return sizes[props.size];
});
</script>

<template>
	<button
		:class="cn(
			'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
			variantClasses,
			sizeClasses,
			props.class,
		)"
		:disabled="disabled"
		data-slot="button"
	>
		<slot />
	</button>
</template>
