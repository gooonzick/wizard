<script setup lang="ts">
import { createWizard } from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";

// ── Data type ──────────────────────────────────────────────────────

type OrderData = {
	plan: "basic" | "pro";
	quantity: number;
	unitPrice: number; // auto-filled from plan
	total: number; // recomputed = quantity * unitPrice
	needsInvoice: boolean;
	companyName: string; // cleared when needsInvoice turns off
};

const PRICES: Record<OrderData["plan"], number> = {
	basic: 10,
	pro: 25,
};

// ── Wizard definition ───────────────────────────────────────────────
// Single step: the point of this example is the data cascade driven by
// `onDataChange`, not navigation.

const orderWizard = createWizard<OrderData>("order")
	.initialStep("order")
	.step("order", (s) => s.title("Order Details"))
	.build();

const initialData: OrderData = {
	plan: "basic",
	quantity: 1,
	unitPrice: PRICES.basic,
	total: PRICES.basic * 1,
	needsInvoice: false,
	companyName: "",
};

// ── Data change log ──────────────────────────────────────────────────

type LogEntry = {
	id: number;
	changedFields: (keyof OrderData)[];
	text: string;
};

const log = ref<LogEntry[]>([]);

const append = (entry: Omit<LogEntry, "id">) => {
	log.value = [...log.value, { ...entry, id: log.value.length }];
};

// ── Composable ─────────────────────────────────────────────────────

const { actions, state } = useWizard({
	definition: orderWizard,
	initialData,
	onDataChange: (prev, next, changedFields) => {
		// Auto-fill the dependent unit price when the plan changes.
		if (changedFields.includes("plan")) {
			actions.updateField("unitPrice", PRICES[next.plan]);
		}
		// Recompute the total whenever quantity or unitPrice changes.
		if (
			changedFields.includes("quantity") ||
			changedFields.includes("unitPrice")
		) {
			actions.updateField("total", next.quantity * next.unitPrice);
		}
		// Clear the dependent company name when the invoice flag turns off.
		if (changedFields.includes("needsInvoice") && !next.needsInvoice) {
			actions.updateField("companyName", "");
		}

		append({
			changedFields,
			text: `→ unitPrice=${next.unitPrice}, total=${next.total}, companyName="${next.companyName}"`,
		});
	},
});
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-5xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Data Change</h1>
				<p class="text-gray-600 mt-1">
					Demonstrates <code>onDataChange</code> driving dependent-field
					auto-fill, recomputation, and cleanup via <code>updateField</code>
					(WIZ-010).
				</p>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
				<Card class="p-8">
					<h2 class="text-xl font-semibold mb-4">
						{{ state.currentStep.value?.meta?.title }}
					</h2>

					<div class="space-y-4">
						<div class="space-y-3">
							<label
								v-for="p in (['basic', 'pro'] as const)"
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
										${{ PRICES[p] }} / unit
									</div>
								</div>
							</label>
						</div>

						<label class="block">
							<span class="text-sm font-medium text-gray-700">Quantity</span>
							<input
								type="number"
								min="1"
								:value="state.data.value.quantity"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
								@input="
									actions.updateField(
										'quantity',
										Number(($event.target as HTMLInputElement).value) || 1,
									)
								"
							/>
						</label>

						<div class="grid grid-cols-2 gap-4 text-sm">
							<div>
								<span class="text-gray-500">Unit price (auto-filled)</span>
								<p class="font-mono font-medium">
									${{ state.data.value.unitPrice }}
								</p>
							</div>
							<div>
								<span class="text-gray-500">Total (recomputed)</span>
								<p class="font-mono font-medium">
									${{ state.data.value.total }}
								</p>
							</div>
						</div>

						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								:checked="state.data.value.needsInvoice"
								class="accent-blue-600"
								@change="
									actions.updateField(
										'needsInvoice',
										($event.target as HTMLInputElement).checked,
									)
								"
							/>
							<span>I need an invoice</span>
						</label>

						<label class="block">
							<span class="text-sm font-medium text-gray-700"
								>Company name</span
							>
							<input
								type="text"
								:disabled="!state.data.value.needsInvoice"
								:value="state.data.value.companyName"
								class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
								placeholder="Acme Inc."
								@input="
									actions.updateField(
										'companyName',
										($event.target as HTMLInputElement).value,
									)
								"
							/>
						</label>
					</div>

					<div class="flex flex-wrap gap-3 mt-8 pt-6 border-t">
						<Button @click="actions.submit">Complete order</Button>
					</div>

					<p
						v-if="state.isCompleted.value"
						class="mt-4 text-sm text-emerald-700 font-medium"
					>
						✓ Order submitted.
					</p>
				</Card>

				<Card class="p-5">
					<h3 class="text-sm font-semibold text-gray-700 mb-3">
						Data change log
					</h3>
					<p v-if="log.length === 0" class="text-xs text-gray-400 italic">
						Edit a field to fire <code>onDataChange</code>
					</p>
					<ul v-else class="space-y-1.5">
						<li
							v-for="entry in [...log].reverse()"
							:key="entry.id"
							class="text-xs rounded-md border px-2 py-1.5 bg-blue-50 text-blue-700 border-blue-200"
						>
							<span class="font-mono font-semibold mr-2">{{
								entry.changedFields.join(", ")
							}}</span>
							{{ entry.text }}
						</li>
					</ul>
					<p class="mt-3 text-xs text-gray-400">
						Changing <strong>plan</strong> auto-fills
						<strong>unitPrice</strong>, which (with
						<strong>quantity</strong>) recomputes <strong>total</strong>.
						Unchecking <strong>needsInvoice</strong> clears
						<strong>companyName</strong>. Each cascade step is its own
						<code>onDataChange</code> round, and terminates via the
						<code>Object.is</code> no-op guard on <code>updateField</code>.
					</p>
				</Card>
			</div>
		</div>
	</div>
</template>
