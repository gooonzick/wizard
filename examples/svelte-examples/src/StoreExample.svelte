<script lang="ts">
	import { createWizardStore } from "@gooonzick/wizard-svelte";
	import { createSignupWizard } from "./wizard/definition";
	import { initialData, PLANS } from "./wizard/initial-data";
	import type { SignupData } from "./wizard/types";

	let completed = $state<SignupData | null>(null);

	const wizard = createWizardStore<SignupData>({
		definition: createSignupWizard(),
		initialData,
		onComplete: (data) => {
			completed = data;
		},
		onReset: () => {
			completed = null;
		},
	});

	// Field stores MUST be declared at the top level of <script> for the `$name`
	// auto-subscription sugar to work. Every write routes through
	// `machine.updateField`, so the Object.is no-op guard and the authoritative
	// `changedFields = [field]` contract survive. Never `bind:` to $wizard.data.
	const name = wizard.field("name");
	const email = wizard.field("email");
	const plan = wizard.field("plan");

	// The per-channel sub-stores are the escape hatch for components that only care
	// about one channel and do not want to wake on unrelated notifies.
	const { navigation, loading } = wizard;
</script>

<section class="panel">
	<h2>{$wizard.currentStep.meta?.title}</h2>
	<p class="description">{$wizard.currentStep.meta?.description}</p>

	<div class="progress">
		<span style="width: {$wizard.progress.percentage}%"></span>
	</div>

	{#if $wizard.currentStepId === "personal"}
		<label>
			<span>Name</span>
			<input bind:value={$name} placeholder="Ada Lovelace" />
			{#if $wizard.validationErrors?.name}
				<p class="error">{$wizard.validationErrors.name}</p>
			{/if}
		</label>

		<label>
			<span>Email</span>
			<input bind:value={$email} placeholder="ada@example.com" />
			{#if $wizard.validationErrors?.email}
				<p class="error">{$wizard.validationErrors.email}</p>
			{/if}
		</label>
	{:else if $wizard.currentStepId === "plan"}
		<label>
			<span>Plan</span>
			<select bind:value={$plan}>
				{#each PLANS as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
			{#if $wizard.validationErrors?.plan}
				<p class="error">{$wizard.validationErrors.plan}</p>
			{/if}
		</label>
	{:else}
		<dl class="debug">
			<dt>Name</dt>
			<dd>{$wizard.data.name}</dd>
			<dt>Email</dt>
			<dd>{$wizard.data.email}</dd>
			<dt>Plan</dt>
			<dd>{$wizard.data.plan}</dd>
		</dl>

		{#if completed}
			<p class="description">Submitted — <code>onComplete</code> fired.</p>
		{/if}
	{/if}

	<div class="controls">
		<button
			class="secondary"
			onclick={() => wizard.goPrevious()}
			disabled={!$navigation.canGoPrevious || $loading.isNavigating}
		>
			Back
		</button>

		{#if $navigation.isLastStep}
			<button
				onclick={() => wizard.actions.submit()}
				disabled={$loading.isSubmitting || $wizard.isCompleted}
			>
				{$loading.isSubmitting ? "Submitting…" : "Submit"}
			</button>
		{:else}
			<button
				onclick={() => wizard.goNext()}
				disabled={!$navigation.canGoNext || $loading.isNavigating}
			>
				{$loading.isNavigating ? "…" : "Next"}
			</button>
		{/if}

		<span class="spacer"></span>

		<button class="secondary" onclick={() => wizard.actions.reset()}>Reset</button>
	</div>

	<dl class="debug">
		<dt>currentStepId</dt>
		<dd>{$wizard.currentStepId}</dd>
		<dt>progress</dt>
		<dd>{$wizard.progress.currentStepIndex + 1} / {$wizard.progress.enabledSteps}</dd>
		<dt>isValid</dt>
		<dd>{$wizard.isValid}</dd>
		<dt>isNavigating</dt>
		<dd>{$loading.isNavigating}</dd>
		<dt>stepHistory</dt>
		<dd>{$navigation.stepHistory.join(" → ")}</dd>
	</dl>
</section>
