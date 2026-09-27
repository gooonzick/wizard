<script lang="ts">
	import type { StepId, WizardDefinition, WizardPlugin } from "@gooonzick/wizard-core";
	import { setWizardContext } from "../../../src/context";
	import { createWizardStore } from "../../../src/create-wizard-store";
	import {
		blankData,
		createRegistrationDefinition,
		type RegistrationData,
	} from "../registration";
	import Controls from "./store-context-controls.svelte";
	import Steps from "./store-context-steps.svelte";

	interface Props {
		definition?: WizardDefinition<RegistrationData>;
		initialData?: RegistrationData;
		presetData?: RegistrationData;
		plugins?: WizardPlugin<RegistrationData>[];
		onComplete?: (data: RegistrationData) => void;
		onCancel?: (data: RegistrationData) => void | Promise<void>;
		onError?: (error: Error) => void;
		onStepEnter?: (stepId: StepId, data: RegistrationData) => void;
	}

	let {
		definition = createRegistrationDefinition(),
		initialData = blankData,
		presetData,
		plugins,
		onComplete,
		onCancel,
		onError,
		onStepEnter,
	}: Props = $props();

	let lastError = $state<string | null>(null);
	const report = (error: unknown) => {
		lastError = error instanceof Error ? error.message : String(error);
	};

	// The parent only creates + publishes; children read it via getWizardContext().
	// svelte-ignore state_referenced_locally
	setWizardContext(
		createWizardStore<RegistrationData>({
			definition,
			initialData,
			plugins,
			onComplete,
			onCancel,
			onStepEnter,
			onError: (error) => {
				report(error);
				onError?.(error);
			},
		}),
	);

	const run = (op: () => Promise<void>) => {
		lastError = null;
		op().catch(report);
	};
</script>

<Steps />
<Controls {run} {presetData} clearError={() => (lastError = null)} />

{#if lastError}
	<p data-testid="error-area">{lastError}</p>
{/if}
