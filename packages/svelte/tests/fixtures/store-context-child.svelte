<script lang="ts">
	import { getWizardContext } from "../../src/context";
	import type { SignupData } from "../helpers/wizard";

	const wizard = getWizardContext<SignupData>();
</script>

<span data-testid="child-step">{$wizard.currentStepId}</span>
