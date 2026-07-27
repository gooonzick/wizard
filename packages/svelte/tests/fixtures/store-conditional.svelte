<script lang="ts">
	import { setWizardContext } from "../../src/context";
	import { createWizardStore } from "../../src/create-wizard-store";
	import {
		createTestDefinition,
		initialData,
		type SignupData,
	} from "../helpers/wizard";
	import Child from "./store-context-child.svelte";

	let { onready } = $props();

	let show = $state(true);

	const wizard = setWizardContext(
		createWizardStore<SignupData>({
			definition: createTestDefinition(),
			initialData,
		}),
	);

	// svelte-ignore state_referenced_locally
	onready?.({
		wizard,
		setShow: (next: boolean) => {
			show = next;
		},
	});
</script>

{#if show}
	<Child />
{/if}
