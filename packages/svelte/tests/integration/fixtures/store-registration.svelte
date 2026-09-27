<script lang="ts">
	import type { StepId, WizardDefinition, WizardPlugin } from "@gooonzick/wizard-core";
	import { createWizardStore } from "../../../src/create-wizard-store";
	import {
		blankData,
		createRegistrationDefinition,
		type RegistrationData,
	} from "../registration";

	interface Props {
		definition?: WizardDefinition<RegistrationData>;
		initialData?: RegistrationData;
		presetData?: RegistrationData;
		plugins?: WizardPlugin<RegistrationData>[];
		onComplete?: (data: RegistrationData) => void;
		onCancel?: (data: RegistrationData) => void | Promise<void>;
		onError?: (error: Error) => void;
		onStepEnter?: (stepId: StepId, data: RegistrationData) => void;
	}

	let {
		definition = createRegistrationDefinition(),
		initialData = blankData,
		presetData,
		plugins,
		onComplete,
		onCancel,
		onError,
		onStepEnter,
	}: Props = $props();

	let lastError = $state<string | null>(null);
	const report = (error: unknown) => {
		lastError = error instanceof Error ? error.message : String(error);
	};

	// svelte-ignore state_referenced_locally
	const wizard = createWizardStore<RegistrationData>({
		definition,
		initialData,
		plugins,
		onComplete,
		onCancel,
		onStepEnter,
		onError: (error) => {
			report(error);
			onError?.(error);
		},
	});

	// svelte-ignore state_referenced_locally
	const stepIds = Object.keys(definition.steps);

	const name = wizard.field("name");
	const email = wizard.field("email");
	const accountType = wizard.field("accountType");
	const company = wizard.field("company");
	const agree = wizard.field("agree");
	const { navigation, loading } = wizard;

	// Every async action is caught here: a user click must never produce an
	// unhandled rejection.
	const run = (op: () => Promise<void>) => {
		lastError = null;
		op().catch(report);
	};
</script>

<ol data-testid="steps">
	{#each stepIds as id (id)}
		<li data-testid="step-{id}" data-status={$wizard.stepStatuses[id]}>{id}</li>
	{/each}
</ol>
<p data-testid="progress">{$wizard.progress.percentage}%</p>

{#if $wizard.isCompleted}
	<section data-testid="complete">
		<h2>Registration complete</h2>
		<p>Welcome, {$wizard.data.name}!</p>
	</section>
{:else}
	<h2 data-testid="current-step">{$wizard.currentStepId}</h2>

	{#if $wizard.currentStepId === "personal"}
		<label for="name">Name</label>
		<input id="name" bind:value={$name} />
		{#if $wizard.validationErrors?.name}
			<p class="field-error">{$wizard.validationErrors.name}</p>
		{/if}
		<label for="email">Email</label>
		<input id="email" bind:value={$email} />
		{#if $wizard.validationErrors?.email}
			<p class="field-error">{$wizard.validationErrors.email}</p>
		{/if}
	{:else if $wizard.currentStepId === "account"}
		<label for="accountType">Account type</label>
		<select id="accountType" bind:value={$accountType}>
			<option value="">Choose…</option>
			<option value="personal">Personal</option>
			<option value="business">Business</option>
		</select>
		{#if $wizard.validationErrors?.accountType}
			<p class="field-error">{$wizard.validationErrors.accountType}</p>
		{/if}
	{:else if $wizard.currentStepId === "company"}
		<label for="company">Company</label>
		<input id="company" bind:value={$company} />
		{#if $wizard.validationErrors?.company}
			<p class="field-error">{$wizard.validationErrors.company}</p>
		{/if}
	{:else if $wizard.currentStepId === "review"}
		<p data-testid="summary">{$wizard.data.name} / {$wizard.data.email} / {$wizard.data.accountType}</p>
		<input id="agree" type="checkbox" bind:checked={$agree} />
		<label for="agree">I agree to the terms</label>
		{#if $wizard.validationErrors?.agree}
			<p class="field-error">{$wizard.validationErrors.agree}</p>
		{/if}
	{/if}

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
		lastError = null;
		wizard.actions.reset();
	}}>Reset</button
>
{#if presetData}
	<button onclick={() => wizard.actions.reset(presetData)}>Load preset</button>
{/if}
<button onclick={() => run(() => wizard.actions.cancel())}>Cancel</button>

{#if lastError}
	<p data-testid="error-area">{lastError}</p>
{/if}
