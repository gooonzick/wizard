<script lang="ts">
	import { WizardStepLoadError } from "@gooonzick/wizard-core";
	import { createWizard } from "@gooonzick/wizard-svelte/runes";
	import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
	import { type LazyDemoData, lazyInitialData } from "./lazy-steps/types";

	let { onRecreate }: { onRecreate: () => void } = $props();

	let loadError = $state<string | null>(null);
	let failureArmed = $state(false);

	const wizard = createWizard<LazyDemoData>({
		definition: createLazyStepsWizard(),
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				const cause = error.cause instanceof Error ? error.cause.message : "";
				loadError = `${error.message}${cause ? ` — ${cause}` : ""} — click Next to retry.`;
				failureArmed = false;
			}
		},
		onStepEnter: () => {
			loadError = null;
		},
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const email = wizard.field("email");
	const passport = wizard.field("passport");

	function next() {
		loadError = null;
		void wizard.goNext().catch(() => {});
	}

	function prefetch() {
		// Skipped while a failure is armed: a silent preload would consume it.
		if (wizard.currentStepId === "account" && !failureArmed) {
			void wizard.actions.preloadStep("documents").catch(() => {});
		}
	}
</script>

<section class="panel">
	<h2>{wizard.currentStep.meta?.title}</h2>
	<p class="description">{wizard.currentStep.meta?.description}</p>

	{#if wizard.isLoadingStep}
		<p class="description" role="status">Loading step implementation…</p>
	{/if}
	{#if loadError}
		<p class="error" role="alert">{loadError}</p>
	{/if}

	{#if wizard.currentStepId === "account"}
		<label>
			<span>Email</span>
			<input bind:value={email.value} placeholder="ada@example.com" />
		</label>
	{:else if wizard.currentStepId === "documents"}
		<label>
			<span>Passport number</span>
			<input bind:value={passport.value} placeholder="AB1234567" />
		</label>
	{:else}
		<pre class="debug">{JSON.stringify(wizard.data, null, 2)}</pre>
	{/if}

	{#each Object.entries(wizard.validationErrors ?? {}) as [field, message] (field)}
		<p class="error">{message}</p>
	{/each}

	<div class="controls">
		<button
			class="secondary"
			onclick={() => wizard.goPrevious().catch(() => {})}
			disabled={!wizard.canGoPrevious || wizard.isNavigating}
		>
			Back
		</button>
		{#if wizard.isLastStep}
			<button onclick={() => wizard.actions.submit().catch(() => {})}>Finish</button>
		{:else}
			<button onclick={next} onmouseenter={prefetch} disabled={wizard.isNavigating}>
				{wizard.isLoadingStep ? "Loading…" : "Next"}
			</button>
		{/if}
		<span class="spacer"></span>
		<button
			class="secondary"
			onclick={() => {
				armLoadFailure();
				failureArmed = true;
			}}
		>
			{failureArmed ? "Next load will fail" : "Fail next load"}
		</button>
		<button class="secondary" onclick={onRecreate}>Recreate wizard</button>
	</div>

	<p class="description">
		A loaded step is cached per wizard; hovering “Next” on the first step prefetches
		it with <code>preloadStep</code>. “Fail next load” only matters before the step
		has loaded once — recreate the wizard to try it again.
	</p>
</section>
