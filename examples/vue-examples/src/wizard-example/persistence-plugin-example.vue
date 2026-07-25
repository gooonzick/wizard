<script setup lang="ts">
import {
	createPersistencePlugin,
	localStorageAdapter,
	type WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";
import { useWizard } from "@gooonzick/wizard-vue";
import { computed, ref } from "vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import WizardForm from "@/components/wizard-form.vue";
import WizardProgress from "@/components/wizard-progress.vue";
import type { RegistrationData } from "../types/wizard-data";
import { stepTitles } from "./constants";
import { initialData } from "./initial-data";
import { advancedWizard } from "./wizard-definition";

// Demo of the WIZ-006 built-in persistence plugin: restore in onInit, debounced
// auto-save on data change, immediate save after every committed transition, and
// automatic clearing on complete / reset / cancel. The payoff is "Reload page".
type EventEntry = { id: string; text: string };

const STORAGE_KEY = "wizard:vue-examples:persistence-plugin";

let evSeq = 0;
const events = ref<EventEntry[]>([]);
const restoreStatus = ref("checking storage…");
const pending = ref(false);
const lastSavedAt = ref<number | null>(null);
const rawTick = ref(0);
// Plain ref: `beforeSave` reads `.value` at flush time, so there is no
// stale-closure trap here (unlike React, which needs a useRef).
const redactSecrets = ref(false);

const push = (text: string) => {
	events.value = [...events.value.slice(-19), { id: `ev-${++evSeq}`, text }];
};

// `localStorage` survives a full browser restart — that is the point of this
// demo. Swap in `sessionStorageAdapter` for per-tab state instead.
const base = localStorageAdapter<RegistrationData>(STORAGE_KEY);

// Instrumented wrapper: also the smallest possible example of a custom
// WizardPersistenceAdapter.
const adapter: WizardPersistenceAdapter<RegistrationData> = {
	load: () => base.load(),
	save: (snapshot) => {
		base.save(snapshot);
		push(`save → step "${snapshot.state.currentStepId}"`);
		pending.value = false;
		lastSavedAt.value = snapshot.savedAt;
		rawTick.value += 1;
	},
	clear: () => {
		base.clear();
		push("clear");
		pending.value = false;
		lastSavedAt.value = null;
		rawTick.value += 1;
	},
};

// Reference-stable — plugins are read once, at machine creation.
// NOTE: the web-storage adapters go through JSON.stringify, which DROPS keys
// whose value is `undefined` (`companySize` / `plan` in `initialData`). After a
// save/restore round-trip those keys are absent rather than present-and-undefined;
// harmless for this demo, and `initial-data.ts` is shared, so leave it alone.
const persistence = createPersistencePlugin<RegistrationData>({
	adapter,
	debounceMs: 800, // deliberately long so the debounce is visible
	version: 1,
	flushOnUnload: true, // pagehide flush; harmless with a sync adapter
	// This wizard's data DOES carry secrets — redact them for real.
	beforeSave: (state) =>
		redactSecrets.value
			? {
					...state,
					data: { ...state.data, password: "", confirmPassword: "" },
				}
			: state,
	// Writing a ref during setup() is legal in Vue, so the restore callbacks can
	// drive the banner directly (React must go through `plugin.ready`).
	onRestored: (state) => {
		restoreStatus.value = `restored → step "${state.currentStepId}"`;
	},
	onRestoreSkipped: (reason) => {
		restoreStatus.value = `nothing restored (${reason})`;
		push(`restore skipped: ${reason}`);
	},
	onRestoreError: (err) => {
		restoreStatus.value = `restore failed: ${err.message}`;
		push(`restore error: ${err.message}`);
	},
	onSaveError: (err) => push(`save error: ${err.message}`),
});

const plugins = [persistence];

const { navigation, actions, state, validation } = useWizard({
	definition: advancedWizard,
	initialData,
	plugins,
	// "unsaved changes…" until the debounced write lands.
	onDataChange: () => {
		pending.value = true;
	},
});

// rawTick is a dependency so the panel re-reads storage after each adapter write.
const raw = computed(() => {
	void rawTick.value;
	return localStorage.getItem(STORAGE_KEY);
});

const savedLabel = computed(() =>
	pending.value
		? "unsaved changes…"
		: lastSavedAt.value
			? `saved ${new Date(lastSavedAt.value).toLocaleTimeString()}`
			: "nothing saved",
);

// `window` is not addressable from a template expression.
const reloadPage = () => window.location.reload();
</script>

<template>
	<div class="min-h-screen bg-gray-50 py-8 px-4">
		<div class="max-w-7xl mx-auto">
			<div class="mb-8">
				<h1 class="text-3xl font-bold text-gray-900">Persistence Plugin</h1>
				<p class="text-gray-600 mt-2">
					Built-in <code>createPersistencePlugin</code> +
					<code>localStorageAdapter</code>: auto-restore on mount, debounced
					auto-save, and automatic clearing on complete / reset / cancel. Fill in
					a step, hit <strong>Reload page</strong>.
				</p>
			</div>

			<WizardProgress
				:progress="state.progress.value"
				:step-titles="stepTitles"
				:step-statuses="state.stepStatuses.value"
			/>

			<div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">
				<Card class="p-8">
					<WizardForm
						:current-step-id="state.currentStepId.value"
						:data="state.data.value"
						:validation-errors="validation.validationErrors.value"
						:on-field-change="actions.updateField"
					/>

					<div class="flex flex-wrap gap-4 mt-6">
						<Button
							variant="outline"
							:disabled="!navigation.canGoPrevious.value"
							@click="navigation.goPrevious"
						>
							Previous
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
								Submit
							</Button>
						</template>
						<Button variant="outline" @click="actions.reset()">
							Reset
						</Button>
						<Button variant="outline" @click="actions.cancel()">
							Cancel
						</Button>
						<Button variant="outline" @click="persistence.flush()">
							Flush now
						</Button>
						<Button variant="outline" @click="persistence.clear()">
							Wipe storage
						</Button>
						<Button class="bg-blue-600 hover:bg-blue-700" @click="reloadPage">
							Reload page
						</Button>
					</div>

					<label class="flex items-center gap-2 mt-4 text-sm text-gray-700">
						<input
							v-model="redactSecrets"
							type="checkbox"
							class="accent-blue-600"
						/>
						<span>
							Redact password before saving (<code>beforeSave</code>)
						</span>
					</label>

					<p class="text-xs text-gray-500 mt-3">
						After <strong>Submit</strong> the record is cleared and the plugin
						goes inert — <strong>Flush now</strong> /
						<strong>Wipe storage</strong> become no-ops until you press
						<strong>Reset</strong>.
					</p>
				</Card>

				<div class="bg-white border rounded-lg p-4 shadow-sm space-y-4">
					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Restore</h2>
						<p
							class="text-sm font-mono text-gray-700 rounded bg-gray-50 border px-2 py-1.5"
						>
							{{ restoreStatus }}
						</p>
					</div>

					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Save status</h2>
						<p
							class="text-sm font-mono"
							:class="pending ? 'text-amber-600' : 'text-green-700'"
						>
							{{ savedLabel }}
						</p>
					</div>

					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Raw storage</h2>
						<pre
							class="max-h-48 overflow-auto text-xs font-mono text-gray-700 rounded bg-gray-50 border p-2 whitespace-pre-wrap break-all"
							>{{ raw ?? "(empty)" }}</pre
						>
					</div>

					<div>
						<h2 class="font-semibold text-gray-900 mb-2">Event feed</h2>
						<p v-if="events.length === 0" class="text-sm text-gray-500">
							Edit a field or navigate to see adapter writes fire.
						</p>
						<ul
							v-else
							class="space-y-1 text-sm font-mono text-gray-700 max-h-64 overflow-y-auto"
						>
							<li v-for="entry in events" :key="entry.id">
								{{ entry.text }}
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
