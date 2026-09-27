<script lang="ts">
	import { getWizardContext } from "../../../src/context";
	import type { RegistrationData } from "../registration";

	interface Props {
		run: (op: () => Promise<void>) => void;
		clearError: () => void;
		presetData?: RegistrationData;
	}

	let { run, clearError, presetData }: Props = $props();

	const wizard = getWizardContext<RegistrationData>();
	const { navigation, loading } = wizard;
</script>

{#if !$wizard.isCompleted}
	<button
		disabled={!$navigation.canGoPrevious || $loading.isNavigating}
		onclick={() => run(() => wizard.goPrevious())}>Back</button
	>
	{#if $wizard.progress.isLastStep}
		<button
			disabled={$loading.isSubmitting || $loading.isNavigating}
			onclick={() => run(() => wizard.actions.submit())}>Finish</button
		>
	{:else}
		<button
			disabled={$loading.isNavigating}
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
