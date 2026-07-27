<script lang="ts">
	import { createWizard } from "../../src/runes/create-wizard.svelte";
	import {
		createTestDefinition,
		initialData,
		type SignupData,
	} from "../helpers/wizard";

	let { onready, onDataChange } = $props();

	// svelte-ignore state_referenced_locally
	const wizard = createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		onDataChange,
	});

	const name = wizard.field("name");

	// svelte-ignore state_referenced_locally
	onready?.(wizard);
</script>

<span data-testid="step">{wizard.currentStepId}</span>
<span data-testid="name">{wizard.data.name}</span>
<input data-testid="input" bind:value={name.value} />
