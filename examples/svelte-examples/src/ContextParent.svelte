<script lang="ts">
	import { createWizardStore, setWizardContext } from "@gooonzick/wizard-svelte";
	import ContextChild from "./ContextChild.svelte";
	import { createSignupWizard } from "./wizard/definition";
	import { initialData } from "./wizard/initial-data";
	import type { SignupData } from "./wizard/types";

	// `setWizardContext` returns the same store, so it composes in one expression.
	// It must run during component initialisation.
	const wizard = setWizardContext(
		createWizardStore<SignupData>({
			definition: createSignupWizard(),
			initialData,
		}),
	);
</script>

<section class="panel">
	<h2>Context</h2>
	<p class="description">
		The parent owns the store and publishes it with <code>setWizardContext</code>;
		the child pulls it back out with <code>getWizardContext</code> and never receives
		a prop.
	</p>

	<div class="controls">
		<button
			class="secondary"
			onclick={() => wizard.goPrevious()}
			disabled={!$wizard.canGoPrevious}
		>
			Back
		</button>
		<button onclick={() => wizard.goNext()} disabled={!$wizard.canGoNext}>
			Next
		</button>
	</div>

	<ContextChild />
</section>
