<script setup lang="ts">
import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";

// ── Data type ──────────────────────────────────────────────────────

type SignupData = {
	email: string;
	password: string;
	plan: "free" | "pro";
	acceptedTerms: boolean;
};

// ── Wizard definition ──────────────────────────────────────────────

const signupWizard = createWizard<SignupData>("signup")
	.initialStep("account")
	.step("account", (s) =>
		s.title("Create Account").required("email", "password").next("plan"),
	)
	.step("plan", (s) =>
		s.title("Select Plan").previous("account").next("review"),
	)
	.step("review", (s) =>
		s
			.title("Review & Confirm")
			.previous("plan")
			.validate((d) => ({
				valid: d.acceptedTerms,
				errors: d.acceptedTerms
					? undefined
					: { acceptedTerms: "You must accept the terms" },
			})),
	)
	.onCancel(async (data) => {
		// Declarative server-side cleanup (e.g. delete a draft).
		// This runs before the machine resets to step 1.
		console.log("[definition.onCancel] cleaning up draft for", data.email);
	})
	.build();

const initialData: SignupData = {
	email: "",
	password: "",
	plan: "free",
	acceptedTerms: false,
};

// ── Event log ──────────────────────────────────────────────────────

type LogEntry = {
	id: number;
	type: "reset" | "cancel" | "complete";
	text: string;
};

const log = ref<LogEntry[]>([]);

const append = (entry: Omit<LogEntry, "id">) => {
	log.value = [...log.value, { ...entry, id: log.value.length }];
};

const colour: Record<LogEntry["type"], string> = {
	reset: "bg-blue-50 text-blue-700 border-blue-200",
	cancel: "bg-amber-50 text-amber-700 border-amber-200",
	complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ── Composable ─────────────────────────────────────────────────────

const { navigation, actions, state, validation } = useWizard({
	definition: signupWizard,
	initialData,
	onComplete: (data) => {
		append({ type: "complete", text: `Signed up ${data.email}` });
	},
	onCancel: (data) => {
		append({
			type: "cancel",
			text: `cancel() called with email="${data.email || "—"}"`,
		});
	},
	onReset: () => {
		append({ type: "reset", text: "Wizard reset to initial state" });
	},
});

const handleCancel = async () => {
	if (!confirm("Discard your progress? This cannot be undone.")) return;
	await actions.cancel();
};
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-5xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Reset & Cancel</h1>
				<p class="text-gray-600 mt-1">
					Demonstrates <code>actions.reset()</code>,
					<code>actions.cancel()</code>, and the <code>onReset</code> /
					<code>onCancel</code> events (WIZ-005).
				</p>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
				<Card class="p-8">
					<h2 class="text-xl font-semibold mb-1">
						Step {{ state.currentStep.value?.id }}:
						{{ state.currentStep.value?.meta?.title }}
					</h2>

					<p
						v-for="(msg, field) in validation.validationErrors.value"
						:key="field"
						class="text-sm text-red-600 mb-2"
					>
						{{ msg }}
					</p>

					<!-- Step: account -->
					<div
						v-if="state.currentStepId.value === 'account'"
						class="space-y-4 mt-4"
					>
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Email</span>
							<input
								type="email"
								:value="state.data.value.email"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="you@example.com"
								@input="
									actions.updateField(
										'email',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
						<label class="block">
							<span class="text-sm font-medium text-gray-700">Password</span>
							<input
								type="password"
								:value="state.data.value.password"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								placeholder="••••••••"
								@input="
									actions.updateField(
										'password',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<!-- Step: plan -->
					<div
						v-if="state.currentStepId.value === 'plan'"
						class="space-y-3 mt-4"
					>
						<label
							v-for="p in (['free', 'pro'] as const)"
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
									<template v-if="p === 'free'">Free forever</template>
									<template v-else>$10/month — all features</template>
								</div>
							</div>
						</label>
					</div>

					<!-- Step: review -->
					<div
						v-if="state.currentStepId.value === 'review'"
						class="space-y-4 mt-4"
					>
						<div class="space-y-1 text-sm">
							<p>
								<strong>Email:</strong> {{ state.data.value.email || "—" }}
							</p>
							<p><strong>Plan:</strong> {{ state.data.value.plan }}</p>
						</div>
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								:checked="state.data.value.acceptedTerms"
								class="accent-blue-600"
								@change="
									actions.updateField(
										'acceptedTerms',
										($event.target as HTMLInputElement).checked,
									)
								"
							/>
							<span>I accept the terms of service</span>
						</label>
					</div>

					<!-- Controls -->
					<div class="flex flex-wrap gap-3 mt-8 pt-6 border-t">
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
								Complete sign up
							</Button>
						</template>

						<div class="flex-1" />

						<Button
							variant="outline"
							class="text-blue-700 border-blue-300 hover:bg-blue-50"
							@click="() => actions.reset()"
						>
							Reset
						</Button>
						<Button
							variant="outline"
							class="text-amber-700 border-amber-300 hover:bg-amber-50"
							@click="handleCancel"
						>
							Cancel
						</Button>
					</div>

					<p
						v-if="state.isCompleted.value"
						class="mt-4 text-sm text-emerald-700 font-medium"
					>
						✓ Sign up completed.
					</p>
				</Card>

				<Card class="p-5">
					<h3 class="text-sm font-semibold text-gray-700 mb-3">Event log</h3>
					<p
						v-if="log.length === 0"
						class="text-xs text-gray-400 italic"
					>
						Click <code>Reset</code> or <code>Cancel</code> to fire events
					</p>
					<ul v-else class="space-y-1.5">
						<li
							v-for="entry in [...log].reverse()"
							:key="entry.id"
							:class="[
								'text-xs rounded-md border px-2 py-1.5',
								colour[entry.type],
							]"
						>
							<span class="font-mono font-semibold uppercase mr-2">{{
								entry.type
							}}</span>
							{{ entry.text }}
						</li>
					</ul>
					<p class="mt-3 text-xs text-gray-400">
						<strong>Reset</strong> rewinds to step 1 with the original data.
						<br />
						<strong>Cancel</strong> awaits <code>onCancel</code> first (e.g. for
						server cleanup), then resets.
					</p>
				</Card>
			</div>
		</div>
	</div>
</template>
