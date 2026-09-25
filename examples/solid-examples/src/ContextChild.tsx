import { useWizardContext } from "@gooonzick/wizard-solid";
import type { SignupData } from "./wizard/types";

export function ContextChild() {
	const wizard = useWizardContext<SignupData>();
	const name = wizard.field("name");

	return (
		<div class="child">
			<label>
				<span>Name (bound from the child)</span>
				<input
					value={name.value}
					onInput={(e) => {
						name.value = e.currentTarget.value;
					}}
					placeholder="Ada Lovelace"
				/>
			</label>

			<dl class="debug">
				<dt>currentStepId</dt>
				<dd>{wizard.currentStepId}</dd>
				<dt>data.name</dt>
				<dd>{wizard.data.name || "—"}</dd>
			</dl>
		</div>
	);
}
