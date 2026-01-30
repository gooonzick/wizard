<script setup lang="ts">
interface StepTitle {
	[key: string]: string;
}

interface Props {
	current: number;
	total: number;
	stepTitles?: StepTitle;
}

defineProps<Props>();

const _getStepStatus = (step: number, current: number, _total: number) => {
	if (step === current) return "current";
	if (step < current) return "visited";
	return "future";
};

const _getStepClasses = (status: string) => {
	switch (status) {
		case "current":
			return "bg-primary text-primary-foreground";
		case "visited":
			return "bg-primary/30 text-primary";
		default:
			return "bg-muted text-muted-foreground";
	}
};
</script>

<template>
	<div class="w-full py-4">
		<div class="flex items-center justify-between relative">
			<template v-for="step in total" :key="step">
				<div class="flex flex-col items-center relative z-10">
					<div
						:class="[
							'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
							getStepClasses(getStepStatus(step, current, total)),
						]"
					>
						<CheckCircle
							v-if="getStepStatus(step, current, total) === 'visited'"
							class="h-4 w-4"
						/>
						<span v-else>{{ step }}</span>
					</div>
					<div
						v-if="stepTitles?.[step]"
						class="mt-2 text-xs font-medium text-muted-foreground"
					>
						{{ stepTitles[step] }}
					</div>
				</div>
				<div
					v-if="step < total"
					class="flex-1 mx-4 h-0.5 bg-muted relative z-0"
				>
					<div
						class="absolute left-0 top-0 h-full bg-primary transition-all duration-300"
						:style="{
							width: getStepStatus(step + 1, current, total) === 'visited'
								? '100%'
								: '0%',
						}"
					/>
				</div>
			</template>
		</div>
	</div>
</template>
