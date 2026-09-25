import { createWizard } from "@gooonzick/wizard-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { createSignupWizard } from "./wizard/definition";
import { initialData, PLANS } from "./wizard/initial-data";
import type { SignupData } from "./wizard/types";

export function BasicExample() {
	const [completed, setCompleted] = createSignal<SignupData | null>(null);

	// Created inside a component, so it is destroyed automatically on unmount.
	const wizard = createWizard<SignupData>({
		definition: createSignupWizard(),
		initialData,
		onComplete: (data) => setCompleted(data),
		onReset: () => setCompleted(null),
	});

	// `field(key)` is a stable `{ get value, set value }` pair backed by
	// `machine.updateField` — never mutate `wizard.data` directly.
	const name = wizard.field("name");
	const email = wizard.field("email");
	const plan = wizard.field("plan");

	return (
		<section class="panel">
			<h2>{wizard.currentStep.meta?.title}</h2>
			<p class="description">{wizard.currentStep.meta?.description}</p>

			<div class="progress">
				<span style={{ width: `${wizard.progress.percentage}%` }} />
			</div>

			<Switch>
				<Match when={wizard.currentStepId === "personal"}>
					<label>
						<span>Name</span>
						<input
							value={name.value}
							onInput={(e) => {
								name.value = e.currentTarget.value;
							}}
							placeholder="Ada Lovelace"
						/>
						<Show when={wizard.validationErrors?.name}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>

					<label>
						<span>Email</span>
						<input
							value={email.value}
							onInput={(e) => {
								email.value = e.currentTarget.value;
							}}
							placeholder="ada@example.com"
						/>
						<Show when={wizard.validationErrors?.email}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>
				</Match>

				<Match when={wizard.currentStepId === "plan"}>
					<label>
						<span>Plan</span>
						<select
							value={plan.value}
							onChange={(e) => {
								plan.value = e.currentTarget.value;
							}}
						>
							<For each={PLANS}>
								{(option) => <option value={option}>{option}</option>}
							</For>
						</select>
						<Show when={wizard.validationErrors?.plan}>
							{(message) => <p class="error">{message()}</p>}
						</Show>
					</label>
				</Match>

				<Match when={wizard.currentStepId === "summary"}>
					<dl class="debug">
						<dt>Name</dt>
						<dd>{wizard.data.name}</dd>
						<dt>Email</dt>
						<dd>{wizard.data.email}</dd>
						<dt>Plan</dt>
						<dd>{wizard.data.plan}</dd>
					</dl>

					<Show when={completed()}>
						<p class="description">
							Submitted — <code>onComplete</code> fired.
						</p>
					</Show>
				</Match>
			</Switch>

			<div class="controls">
				<button
					type="button"
					class="secondary"
					onClick={() => void wizard.goPrevious().catch(() => {})}
					disabled={!wizard.canGoPrevious || wizard.isNavigating}
				>
					Back
				</button>

				<Show
					when={wizard.isLastStep}
					fallback={
						<button
							type="button"
							onClick={() => void wizard.goNext().catch(() => {})}
							disabled={!wizard.canGoNext || wizard.isNavigating}
						>
							{wizard.isNavigating ? "…" : "Next"}
						</button>
					}
				>
					<button
						type="button"
						onClick={() => void wizard.actions.submit().catch(() => {})}
						disabled={wizard.isSubmitting || wizard.isCompleted}
					>
						{wizard.isSubmitting ? "Submitting…" : "Submit"}
					</button>
				</Show>

				<span class="spacer" />

				<button
					type="button"
					class="secondary"
					onClick={() => wizard.actions.reset()}
				>
					Reset
				</button>
			</div>

			<dl class="debug">
				<dt>currentStepId</dt>
				<dd>{wizard.currentStepId}</dd>
				<dt>progress</dt>
				<dd>
					{wizard.progress.currentStepIndex + 1} /{" "}
					{wizard.progress.enabledSteps}
				</dd>
				<dt>isValid</dt>
				<dd>{String(wizard.isValid)}</dd>
				<dt>isNavigating</dt>
				<dd>{String(wizard.isNavigating)}</dd>
				<dt>stepHistory</dt>
				<dd>{wizard.stepHistory.join(" → ")}</dd>
			</dl>
		</section>
	);
}
