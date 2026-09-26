import { createWizard, WizardProvider } from "@gooonzick/wizard-solid";
import { ContextChild } from "./ContextChild";
import { createSignupWizard } from "./wizard/definition";
import { initialData } from "./wizard/initial-data";
import type { SignupData } from "./wizard/types";

export function ContextExample() {
	// The parent owns the wizard; WizardProvider only publishes it.
	const wizard = createWizard<SignupData>({
		definition: createSignupWizard(),
		initialData,
	});

	return (
		<section class="panel">
			<h2>Context</h2>
			<p class="description">
				The parent owns the wizard and publishes it with{" "}
				<code>&lt;WizardProvider&gt;</code>; the child pulls it back out with{" "}
				<code>useWizardContext()</code> and never receives a prop.
			</p>

			<div class="controls">
				<button
					type="button"
					class="secondary"
					onClick={() => void wizard.goPrevious().catch(() => {})}
					disabled={!wizard.canGoPrevious}
				>
					Back
				</button>
				<button
					type="button"
					onClick={() => void wizard.goNext().catch(() => {})}
					disabled={!wizard.canGoNext}
				>
					Next
				</button>
			</div>

			<WizardProvider wizard={wizard}>
				<ContextChild />
			</WizardProvider>
		</section>
	);
}
