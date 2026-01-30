<script setup lang="ts">
import { CheckCircle2 } from "lucide-vue-next";
import { computed } from "vue";

interface Props {
	currentStepId: string;
	stepIds: readonly string[];
	stepTitles: Record<string, string>;
}

const props = defineProps<Props>();

const currentIndex = computed(() => props.stepIds.indexOf(props.currentStepId));

const getStepStatus = (stepId: string) => {
	const index = props.stepIds.indexOf(stepId);
	if (index < currentIndex.value) return "completed";
	if (index === currentIndex.value) return "current";
	return "pending";
};
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
						getStepStatus(stepId) === 'completed'
							? 'bg-green-500 border-green-500'
							: getStepStatus(stepId) === 'current'
								? 'bg-blue-500 border-blue-500'
								: 'bg-gray-200 border-gray-300',
					]"
				>
					<template v-if="getStepStatus(stepId) === 'completed'">
						<CheckCircle2 class="w-5 h-5 text-white" />
					</template>
					<template v-else>
						<span class="text-sm font-semibold text-gray-700">
							{{ index + 1 }}
						</span>
					</template>
				</div>
				<span
					:class="[
						'text-xs font-medium text-center line-clamp-2',
						getStepStatus(stepId) === 'current' ? 'text-blue-600' : 'text-gray-600',
					]"
				>
					{{ stepTitles[stepId] || stepId }}
				</span>
			</div>
		</div>
	</div>
</template>
