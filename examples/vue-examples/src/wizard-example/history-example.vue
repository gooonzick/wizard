<script setup lang="ts">
import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";

// ── Data type ──────────────────────────────────────────────────────

type PlanType = "basic" | "pro" | "enterprise";

type CheckoutData = {
	name: string;
	plan: PlanType;
	coupon: string;
	company: string;
};

// ── Wizard with conditional branching ──────────────────────────────

const checkoutWizard = createWizard<CheckoutData>("checkout")
	.initialStep("personal")
	.step("personal", (s) =>
		s.title("Personal Info").required("name").next("plan"),
	)
	.step("plan", (s) =>
		s
			.title("Select Plan")
			.required("plan")
			.previous("personal")
			.nextWhen([
				{ when: (d) => d.plan === "enterprise", to: "company" },
				{ when: (d) => d.plan === "pro", to: "addons" },
				{ when: () => true, to: "review" },
			]),
	)
	.step("company", (s) =>
		s
			.title("Company Details")
			.required("company")
			.previous("plan")
			.next("review"),
	)
	.step("addons", (s) =>
		s.title("Pro Add-ons").previous("plan").next("review"),
	)
	.step("review", (s) => s.title("Review & Pay").previous("plan"))
	.build();

const initialData: CheckoutData = {
	name: "",
	plan: "basic",
	coupon: "",
	company: "",
};

const stepTitles: Record<string, string> = {
	personal: "Personal",
	plan: "Plan",
	company: "Company",
	addons: "Add-ons",
	review: "Review",
};

// ── Composable ─────────────────────────────────────────────────────

const { navigation, actions, state, validation } = useWizard({
	definition: checkoutWizard,
	initialData,
	onComplete: (data) => {
		console.log("Checkout complete!", data);
		alert("Checkout complete! Check console.");
	},
});
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-5xl mx-auto">
			<!-- Header -->
			<h1 class="text-3xl font-bold text-gray-900 mb-1">
				Navigation History Stack
			</h1>
			<p class="text-gray-600 mb-6">
				Conditional branching checkout — "Back" always returns to the step you
				<em>actually</em> came from
			</p>

			<!-- Layout -->
			<div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
				<!-- Form -->
				<Card class="p-8">
					<h2 class="text-xl font-semibold mb-1">
						{{ state.currentStep.value.meta?.title ?? state.currentStep.value.id }}
					</h2>
					<p
						v-if="state.currentStep.value.meta?.description"
						class="text-sm text-gray-500 mb-4"
					>
						{{ state.currentStep.value.meta.description }}
					</p>

					<!-- Validation errors -->
					<p
						v-for="(msg, field) in validation.validationErrors.value"
						:key="field"
						class="text-sm text-red-600 mb-2"
					>
						{{ msg }}
					</p>

					<!-- Step: personal -->
					<div
						v-if="state.currentStepId.value === 'personal'"
						class="space-y-4"
					>
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Name</span>
							<input
								:value="state.data.value.name"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="Your name"
								@input="
									actions.updateField(
										'name',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<!-- Step: plan -->
					<div
						v-if="state.currentStepId.value === 'plan'"
						class="space-y-3"
					>
						<span class="text-sm font-medium text-gray-700"
							>Choose a plan</span
						>
						<label
							v-for="p in (['basic', 'pro', 'enterprise'] as const)"
							:key="p"
							:class="[
								'flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition',
								state.data.value.plan === p
									? 'border-blue-500 bg-blue-50'
									: 'border-gray-200 hover:bg-gray-50',
							]"
						>
							<input
								type="radio"
								name="plan"
								:value="p"
								:checked="state.data.value.plan === p"
								class="accent-blue-600"
								@change="actions.updateField('plan', p)"
							/>
							<div>
								<div class="font-medium capitalize">{{ p }}</div>
								<div class="text-xs text-gray-500">
									<template v-if="p === 'basic'"
										>Free tier — limited features</template
									>
									<template v-if="p === 'pro'"
										>Pro add-ons available</template
									>
									<template v-if="p === 'enterprise'"
										>Custom billing — needs company info</template
									>
								</div>
							</div>
						</label>
					</div>

					<!-- Step: company -->
					<div v-if="state.currentStepId.value === 'company'">
						<label class="block">
							<span class="text-sm font-medium text-gray-700"
								>Company Name</span
							>
							<input
								:value="state.data.value.company"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="Acme Inc."
								@input="
									actions.updateField(
										'company',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<!-- Step: addons -->
					<div v-if="state.currentStepId.value === 'addons'">
						<label class="block">
							<span class="text-sm font-medium text-gray-700"
								>Coupon code (optional)</span
							>
							<input
								:value="state.data.value.coupon"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="SAVE20"
								@input="
									actions.updateField(
										'coupon',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<!-- Step: review -->
					<div
						v-if="state.currentStepId.value === 'review'"
						class="space-y-2 text-sm"
					>
						<p><strong>Name:</strong> {{ state.data.value.name || "—" }}</p>
						<p><strong>Plan:</strong> {{ state.data.value.plan }}</p>
						<p v-if="state.data.value.company">
							<strong>Company:</strong> {{ state.data.value.company }}
						</p>
						<p v-if="state.data.value.coupon">
							<strong>Coupon:</strong> {{ state.data.value.coupon }}
						</p>
					</div>

					<!-- Controls -->
					<div class="flex gap-3 mt-6">
						<Button
							variant="outline"
							:disabled="!navigation.canGoBack.value"
							@click="navigation.goPrevious"
						>
							Back
						</Button>

						<template v-if="!navigation.isLastStep.value">
							<Button
								:disabled="!navigation.canGoNext.value"
								@click="navigation.goNext"
							>
								Next
							</Button>
						</template>
						<template v-else>
							<Button
								class="bg-green-600 hover:bg-green-700"
								@click="actions.submit"
							>
								Complete
							</Button>
						</template>
					</div>
				</Card>

				<!-- History sidebar -->
				<Card class="p-5">
					<h3 class="text-sm font-semibold text-gray-700 mb-3">
						Navigation History Stack
					</h3>
					<div class="flex flex-col-reverse gap-1.5">
						<div
							v-for="(stepId, index) in navigation.stepHistory.value"
							:key="`${stepId}-${index}`"
							:class="[
								'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition',
								index === navigation.stepHistory.value.length - 1
									? 'bg-blue-100 text-blue-800 font-medium ring-1 ring-blue-300'
									: 'bg-gray-100 text-gray-600',
							]"
						>
							<span class="font-mono text-xs text-gray-400 w-4">
								{{ index }}
							</span>
							<span>{{ stepTitles[stepId] ?? stepId }}</span>
							<span
								v-if="index === navigation.stepHistory.value.length - 1"
								class="ml-auto text-[10px] uppercase tracking-wide text-blue-500"
							>
								current
							</span>
						</div>
					</div>
					<p class="mt-3 text-xs text-gray-400">
						Back pops the stack — forward pushes. The resolver is never
						consulted when history is available, so conditional branches always
						go back to where you <em>actually</em> came from.
					</p>
				</Card>
			</div>
		</div>
	</div>
</template>
