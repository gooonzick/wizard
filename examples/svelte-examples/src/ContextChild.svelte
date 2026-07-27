<script lang="ts">
	import { getWizardContext } from "@gooonzick/wizard-svelte";
	import type { SignupData } from "./wizard/types";

	const wizard = getWizardContext<SignupData>();
	const name = wizard.field("name");
</script>

<div class="child">
	<label>
		<span>Name (bound from the child)</span>
		<input bind:value={$name} placeholder="Ada Lovelace" />
	</label>

	<dl class="debug">
		<dt>currentStepId</dt>
		<dd>{$wizard.currentStepId}</dd>
		<dt>data.name</dt>
		<dd>{$wizard.data.name || "—"}</dd>
	</dl>
</div>
