<script setup lang="ts">
import { AlertCircle } from "lucide-vue-next";

interface Props {
	error?: string;
}

defineProps<Props>();
</script>

<template>
	<div v-if="error" class="mt-1 flex items-center gap-1 text-sm text-destructive">
		<AlertCircle class="h-3 w-3" />
		<span>{{ error }}</span>
	</div>
</template>
