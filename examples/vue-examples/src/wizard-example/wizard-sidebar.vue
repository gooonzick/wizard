<script setup lang="ts">
import { useWizardData, useWizardNavigation } from "@gooonzick/wizard-vue";
import { CheckCircle2, Circle } from "lucide-vue-next";
import { computed } from "vue";
import Card from "@/components/ui/card.vue";
import type { RegistrationData } from "../types/wizard-data";
import { fieldLabels, stepIds, stepTitles } from "./constants";

const { data, currentStepId } = useWizardData<RegistrationData>();
const { goTo } = useWizardNavigation();

const currentIndex = computed(() =>
	stepIds.indexOf(currentStepId.value as (typeof stepIds)[number]),
);
</script>

<template>
	<div class="sticky top-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
		<Card class="p-6 space-y-6">
			<!-- Live Data Summary -->
			<div>
				<h3 class="font-semibold text-lg mb-3">Summary</h3>
				<div class="space-y-2">
					<div v-for="[key, value] in Object.entries(data)" :key="key" class="text-sm">
						<span v-if="typeof value !== 'object' && (typeof value !== 'string' || value !== '')" class="flex justify-between items-start">
							<span class="text-gray-600">
								{{ fieldLabels[key] || key }}:
							</span>
							<span class="font-medium ml-2 text-right">
								{{ typeof value === "boolean" ? (value ? "Yes" : "No") : String(value) }}
							</span>
						</span>
					</div>
				</div>
			</div>

			<!-- Progress -->
			<div class="border-t pt-4">
				<h3 class="font-semibold text-sm mb-3">Progress</h3>
				<div class="space-y-2">
					<component
						v-for="(stepId, index) in stepIds"
						:key="stepId"
						:is="index < currentIndex ? 'button' : 'div'"
						:class="[
							'flex items-center gap-2 w-full text-left rounded px-1 -mx-1',
							index < currentIndex ? 'cursor-pointer hover:bg-gray-100' : '',
						]"
						@click="index < currentIndex ? goTo(stepId) : undefined"
					>
						<CheckCircle2
							v-if="index < currentIndex"
							class="w-4 h-4 text-green-500 shrink-0"
						/>
						<Circle
							v-else
							:class="[
								'w-4 h-4 shrink-0',
								stepId === currentStepId ? 'text-blue-500' : 'text-gray-300',
							]"
						/>
						<span
							:class="[
								'text-sm',
								stepId === currentStepId
									? 'font-semibold text-blue-600'
									: index < currentIndex
										? 'text-gray-600'
										: 'text-gray-500',
							]"
						>
							{{ stepTitles[stepId] || stepId }}
						</span>
					</component>
				</div>
			</div>
		</Card>
	</div>
</template>
