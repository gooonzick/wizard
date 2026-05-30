<script setup lang="ts">
import { createWizard, type WizardSerializedState } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { computed, onMounted, ref, watch } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";

const STORAGE_KEY = "wizard-vue-persistence-example";

interface CheckoutData extends Record<string, unknown> {
	contactName: string;
	email: string;
	shippingAddress: string;
	deliverySpeed: "standard" | "express";
	giftWrap: boolean;
}

const checkoutWizard = createWizard<CheckoutData>("persisted-checkout")
	.initialStep("contact")
	.step("contact", (s) =>
		s.title("Contact").required("contactName", "email").next("shipping"),
	)
	.step("shipping", (s) =>
		s
			.title("Shipping")
			.required("shippingAddress")
			.previous("contact")
			.next("review"),
	)
	.step("review", (s) => s.title("Review").previous("shipping"))
	.build();

const initialData: CheckoutData = {
	contactName: "",
	email: "",
	shippingAddress: "",
	deliverySpeed: "standard",
	giftWrap: false,
};

const stepTitles: Record<string, string> = {
	contact: "Contact",
	shipping: "Shipping",
	review: "Review",
};

const restoreMessage = ref("No saved draft loaded");
const hasHydrated = ref(false);

const { navigation, actions, state, validation } = useWizard({
	definition: checkoutWizard,
	initialData,
	onComplete: (data) => {
		alert(`Checkout complete for ${data.email}`);
		localStorage.removeItem(STORAGE_KEY);
	},
});

const statusEntries = computed(() => Object.entries(state.stepStatuses.value));

onMounted(() => {
	const savedState = localStorage.getItem(STORAGE_KEY);
	if (!savedState) {
		hasHydrated.value = true;
		return;
	}

	try {
		actions.restore(
			JSON.parse(savedState) as WizardSerializedState<CheckoutData>,
		);
		restoreMessage.value = "Saved draft restored from localStorage";
	} catch {
		localStorage.removeItem(STORAGE_KEY);
		restoreMessage.value = "Saved draft was incompatible and was cleared";
	}

	hasHydrated.value = true;
});

watch(
	[
		state.currentStepId,
		state.data,
		state.isCompleted,
		state.stepStatuses,
		navigation.stepHistory,
		navigation.visitedSteps,
	],
	() => {
		if (!hasHydrated.value) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(actions.serialize()));
	},
	{ deep: true },
);

const clearDraft = () => {
	localStorage.removeItem(STORAGE_KEY);
	actions.reset();
	restoreMessage.value = "Saved draft cleared";
};
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-5xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">State Persistence</h1>
				<p class="text-gray-600 mt-1">
					Saves a checkout draft with <code>actions.serialize()</code> and
					restores it with <code>actions.restore()</code>.
				</p>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
				<Card class="p-8">
					<h2 class="text-xl font-semibold mb-1">
						{{ state.currentStep.value.meta?.title ?? state.currentStep.value.id }}
					</h2>
					<p class="text-sm text-gray-500 mb-6">
						{{ restoreMessage }}. Refresh the page or switch tabs to see the saved
						step and form data return.
					</p>

					<p
						v-for="(message, field) in validation.validationErrors.value"
						:key="field"
						class="text-sm text-red-600 mb-2"
					>
						{{ message }}
					</p>

					<div v-if="state.currentStepId.value === 'contact'" class="space-y-4">
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Name</span>
							<input
								:value="state.data.value.contactName"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="Ada Lovelace"
								@input="
									actions.updateField(
										'contactName',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Email</span>
							<input
								:value="state.data.value.email"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="ada@example.com"
								@input="
									actions.updateField(
										'email',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<div v-if="state.currentStepId.value === 'shipping'" class="space-y-4">
						<label class="block">
							<span class="text-sm font-medium text-gray-700"
								>Shipping address</span
							>
							<textarea
								:value="state.data.value.shippingAddress"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								rows="4"
								placeholder="123 Example Street"
								@input="
									actions.updateField(
										'shippingAddress',
										($event.target as HTMLTextAreaElement).value,
									)
								"
							/>
						</label>
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Delivery speed</span>
							<select
								:value="state.data.value.deliverySpeed"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								@change="
									actions.updateField(
										'deliverySpeed',
										($event.target as HTMLSelectElement)
											.value as CheckoutData['deliverySpeed'],
									)
								"
							>
								<option value="standard">Standard</option>
								<option value="express">Express</option>
							</select>
						</label>
					</div>

					<div
						v-if="state.currentStepId.value === 'review'"
						class="space-y-3 text-sm"
					>
						<p><strong>Name:</strong> {{ state.data.value.contactName || "-" }}</p>
						<p><strong>Email:</strong> {{ state.data.value.email || "-" }}</p>
						<p>
							<strong>Address:</strong>
							{{ state.data.value.shippingAddress || "-" }}
						</p>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								:checked="state.data.value.giftWrap"
								class="accent-blue-600"
								@change="
									actions.updateField(
										'giftWrap',
										($event.target as HTMLInputElement).checked,
									)
								"
							/>
							<span>Add gift wrap</span>
						</label>
					</div>

					<div class="flex flex-wrap gap-3 mt-8 pt-6 border-t">
						<Button
							variant="outline"
							:disabled="!navigation.canGoBack.value"
							@click="navigation.goPrevious()"
						>
							Back
						</Button>
						<Button
							v-if="!navigation.isLastStep.value"
							:disabled="!navigation.canGoNext.value"
							@click="navigation.goNext()"
						>
							Next
						</Button>
						<Button v-else @click="actions.submit()">Complete checkout</Button>
						<div class="flex-1" />
						<Button variant="outline" @click="clearDraft">Clear draft</Button>
					</div>
				</Card>

				<Card class="p-5">
					<h3 class="text-sm font-semibold text-gray-700 mb-3">
						Persisted Snapshot
					</h3>
					<div class="space-y-3 text-sm">
						<div>
							<p class="text-xs uppercase text-gray-400 mb-1">History</p>
							<p class="font-mono text-xs text-gray-700">
								{{ navigation.stepHistory.value.join(" -> ") }}
							</p>
						</div>
						<div>
							<p class="text-xs uppercase text-gray-400 mb-1">Visited</p>
							<div class="flex flex-wrap gap-1.5">
								<span
									v-for="stepId in navigation.visitedSteps.value"
									:key="stepId"
									class="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
								>
									{{ stepTitles[stepId] ?? stepId }}
								</span>
							</div>
						</div>
						<div>
							<p class="text-xs uppercase text-gray-400 mb-1">Statuses</p>
							<ul class="space-y-1">
								<li
									v-for="entry in statusEntries"
									:key="entry[0]"
									class="flex justify-between gap-3"
								>
									<span>{{ stepTitles[entry[0]] ?? entry[0] }}</span>
									<span class="font-mono text-xs text-gray-500">
										{{ entry[1] }}
									</span>
								</li>
							</ul>
						</div>
					</div>
				</Card>
			</div>
		</div>
	</div>
</template>
