<script setup lang="ts">
import type { StepStatus } from "@gooonzick/wizard-core";
import { CheckCircle2, AlertCircle } from "lucide-vue-next";

interface Props {
	currentStepId: string;
	stepIds: readonly string[];
	stepTitles: Record<string, string>;
	stepStatuses: Record<string, StepStatus>;
}

defineProps<Props>();

</script>

<template>
	<div class="space-y-4 mb-6">
		<div class="flex justify-between items-center">
			<div
				v-for="(stepId, index) in stepIds"
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
