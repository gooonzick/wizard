<script lang="ts">
	import ContextParent from "./ContextParent.svelte";
	import RunesExample from "./RunesExample.svelte";
	import StoreExample from "./StoreExample.svelte";

	type Tab = "store" | "runes" | "context";

	const TABS: Array<{ id: Tab; label: string }> = [
		{ id: "store", label: "Store API" },
		{ id: "runes", label: "Runes API" },
		{ id: "context", label: "Context" },
	];

	let tab = $state<Tab>("store");
</script>

<main>
	<h1>WizardForm — Svelte examples</h1>
	<p class="lede">
		The same wizard driven by both layers of <code>@gooonzick/wizard-svelte</code>.
		Switching tabs unmounts the previous demo, which destroys its machine — so each
		tab starts from a clean wizard.
	</p>

	<div class="tabs" role="tablist">
		{#each TABS as { id, label } (id)}
			<button
				role="tab"
				aria-selected={tab === id}
				onclick={() => {
					tab = id;
				}}
			>
				{label}
			</button>
		{/each}
	</div>

	{#if tab === "store"}
		<StoreExample />
	{:else if tab === "runes"}
		<RunesExample />
	{:else}
		<ContextParent />
	{/if}
</main>
