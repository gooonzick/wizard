<script lang="ts">
	import { getWizardContext } from "../../../src/runes/index.svelte";
	import type { RegistrationData } from "../registration";

	interface Props {
		run: (op: () => Promise<void>) => void;
		clearError: () => void;
		presetData?: RegistrationData;
	}

	let { run, clearError, presetData }: Props = $props();

	const wizard = getWizardContext<RegistrationData>();
</script>

{#if !wizard.isCompleted}
	<button
		disabled={!wizard.canGoPrevious || wizard.isNavigating}
		onclick={() => run(() => wizard.goPrevious())}>Back</button
	>
	{#if wizard.progress.isLastStep}
		<button
			disabled={wizard.isSubmitting || wizard.isNavigating}
			onclick={() => run(() => wizard.actions.submit())}>Finish</button
		>
	{:else}
		<button
			disabled={wizard.isNavigating}
			onclick={() => run(() => wizard.goNext())}>Next</button
		>
	{/if}
{/if}

<button
	onclick={() => {
		clearError();
		wizard.actions.reset();
	}}>Reset</button
>
{#if presetData}
	<button onclick={() => wizard.actions.reset(presetData)}>Load preset</button>
{/if}
<button onclick={() => run(() => wizard.actions.cancel())}>Cancel</button>
