<script setup lang="ts">
import type { StepStatus, WizardProgress } from "@gooonzick/wizard-core";
import { CheckCircle2, AlertCircle } from "lucide-vue-next";

interface Props {
	progress: WizardProgress;
	stepTitles: Record<string, string>;
	stepStatuses: Record<string, StepStatus>;
}

defineProps<Props>();
</script>

<template>
	<div class="space-y-4 mb-6">
		<div class="flex items-center justify-between gap-4">
			<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
				<div
					class="h-full bg-blue-500 transition-all"
					:style="{ width: `${progress.percentage}%` }"
				/>
			</div>
			<div
				class="text-sm font-medium text-gray-700 whitespace-nowrap tabular-nums"
			>
				Step {{ Math.max(progress.currentStepIndex, 0) + 1 }} /
				{{ progress.enabledSteps }} · {{ progress.percentage }}%
			</div>
		</div>
		<div class="flex justify-between items-center">
			<div
				v-for="(stepId, index) in progress.enabledStepIds"
				:key="stepId"
				class="flex flex-col items-center flex-1"
			>
				<div
					:class="[
						'flex items-center justify-center w-10 h-10 rounded-full border-2 mb-2 transition-colors',
						stepStatuses[stepId] === 'completed'
							? 'bg-green-500 border-green-500'
							: stepStatuses[stepId] === 'active'
								? 'bg-blue-500 border-blue-500'
								: stepStatuses[stepId] === 'error'
									? 'bg-red-500 border-red-500'
									: stepStatuses[stepId] === 'visited'
										? 'bg-blue-200 border-blue-300'
										: 'bg-gray-200 border-gray-300',
					]"
				>
					<template v-if="stepStatuses[stepId] === 'completed'">
						<CheckCircle2 class="w-5 h-5 text-white" />
					</template>
					<template v-else-if="stepStatuses[stepId] === 'error'">
						<AlertCircle class="w-5 h-5 text-white" />
					</template>
					<template v-else>
						<span
							:class="[
								'text-sm font-semibold',
								stepStatuses[stepId] === 'active' ? 'text-white' : 'text-gray-700',
							]"
						>
							{{ index + 1 }}
						</span>
					</template>
				</div>
				<span
					:class="[
						'text-xs font-medium text-center line-clamp-2',
						stepStatuses[stepId] === 'active'
							? 'text-blue-600'
							: stepStatuses[stepId] === 'error'
								? 'text-red-600'
								: 'text-gray-600',
					]"
				>
					{{ stepTitles[stepId] || stepId }}
				</span>
			</div>
		</div>
	</div>
</template>
