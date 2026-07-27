<script lang="ts">
	import { createWizardStore } from "../../src/create-wizard-store";
	import {
		createTestDefinition,
		initialData,
		type SignupData,
	} from "../helpers/wizard";

	let { onready, onDataChange, plugins } = $props();

	// svelte-ignore state_referenced_locally
	const wizard = createWizardStore<SignupData>({
		definition: createTestDefinition(),
		initialData,
		onDataChange,
		plugins,
	});

	const name = wizard.field("name");

	// svelte-ignore state_referenced_locally
	onready?.(wizard);
</script>

<span data-testid="step">{$wizard.currentStepId}</span>
<span data-testid="name">{$wizard.data.name}</span>
<input data-testid="input" bind:value={$name} />
<button
	data-testid="next"
	disabled={!$wizard.canGoNext}
	onclick={() => wizard.goNext()}>Next</button
>
