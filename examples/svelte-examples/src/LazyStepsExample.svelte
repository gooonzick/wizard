<script lang="ts">
	import LazyStepsWizard from "./LazyStepsWizard.svelte";

	let generation = $state(0);
</script>

{#key generation}
	<LazyStepsWizard onRecreate={() => (generation += 1)} />
{/key}
