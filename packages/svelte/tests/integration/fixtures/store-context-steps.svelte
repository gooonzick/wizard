<script lang="ts">
	import { getWizardContext } from "../../../src/context";
	import type { RegistrationData } from "../registration";

	const wizard = getWizardContext<RegistrationData>();
	const name = wizard.field("name");
	const email = wizard.field("email");
	const accountType = wizard.field("accountType");
	const company = wizard.field("company");
	const agree = wizard.field("agree");
</script>

<ol data-testid="steps">
	{#each Object.keys($wizard.stepStatuses) as id (id)}
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
{/if}
