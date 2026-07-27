<script lang="ts">
	import { createWizard } from "@gooonzick/wizard-svelte/runes";
	import { createSignupWizard } from "./wizard/definition";
	import { initialData, PLANS } from "./wizard/initial-data";
	import type { SignupData } from "./wizard/types";

	let completed = $state<SignupData | null>(null);

	const wizard = createWizard<SignupData>({
		definition: createSignupWizard(),
		initialData,
		onComplete: (data) => {
			completed = data;
		},
		onReset: () => {
			completed = null;
		},
	});

	// `field(key)` returns a stable `{ get value, set value }` pair backed by
	// `machine.updateField`. `wizard.data` comes from `$state.raw`, so mutating it
	// directly would be BOTH non-reactive and a bypass of the machine.
	const name = wizard.field("name");
	const email = wizard.field("email");
	const plan = wizard.field("plan");
</script>

<section class="panel">
	<h2>{wizard.currentStep.meta?.title}</h2>
	<p class="description">{wizard.currentStep.meta?.description}</p>

	<div class="progress">
		<span style="width: {wizard.progress.percentage}%"></span>
	</div>

	{#if wizard.currentStepId === "personal"}
		<label>
			<span>Name</span>
			<input bind:value={name.value} placeholder="Ada Lovelace" />
			{#if wizard.validationErrors?.name}
				<p class="error">{wizard.validationErrors.name}</p>
			{/if}
		</label>

		<label>
			<span>Email</span>
			<input bind:value={email.value} placeholder="ada@example.com" />
			{#if wizard.validationErrors?.email}
				<p class="error">{wizard.validationErrors.email}</p>
			{/if}
		</label>
	{:else if wizard.currentStepId === "plan"}
		<label>
			<span>Plan</span>
			<select bind:value={plan.value}>
				{#each PLANS as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
			{#if wizard.validationErrors?.plan}
				<p class="error">{wizard.validationErrors.plan}</p>
			{/if}
		</label>
	{:else}
		<dl class="debug">
			<dt>Name</dt>
			<dd>{wizard.data.name}</dd>
			<dt>Email</dt>
			<dd>{wizard.data.email}</dd>
			<dt>Plan</dt>
			<dd>{wizard.data.plan}</dd>
		</dl>

		{#if completed}
			<p class="description">Submitted — <code>onComplete</code> fired.</p>
		{/if}
	{/if}

	<div class="controls">
		<button
			class="secondary"
			onclick={() => wizard.goPrevious()}
			disabled={!wizard.canGoPrevious || wizard.isNavigating}
		>
			Back
		</button>

		{#if wizard.isLastStep}
			<button
				onclick={() => wizard.actions.submit()}
				disabled={wizard.isSubmitting || wizard.isCompleted}
			>
				{wizard.isSubmitting ? "Submitting…" : "Submit"}
			</button>
		{:else}
			<button
				onclick={() => wizard.goNext()}
				disabled={!wizard.canGoNext || wizard.isNavigating}
			>
				{wizard.isNavigating ? "…" : "Next"}
			</button>
		{/if}

		<span class="spacer"></span>

		<button class="secondary" onclick={() => wizard.actions.reset()}>Reset</button>
	</div>

	<dl class="debug">
		<dt>currentStepId</dt>
		<dd>{wizard.currentStepId}</dd>
		<dt>progress</dt>
		<dd>{wizard.progress.currentStepIndex + 1} / {wizard.progress.enabledSteps}</dd>
		<dt>isValid</dt>
		<dd>{wizard.isValid}</dd>
		<dt>isNavigating</dt>
		<dd>{wizard.isNavigating}</dd>
		<dt>stepHistory</dt>
		<dd>{wizard.navigation.stepHistory.join(" → ")}</dd>
	</dl>
</section>
