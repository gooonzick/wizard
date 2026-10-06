import { WizardStepLoadError } from "@gooonzick/wizard-core";
import { createWizard } from "@gooonzick/wizard-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { armLoadFailure, createLazyStepsWizard } from "./lazy-steps/definition";
import { type LazyDemoData, lazyInitialData } from "./lazy-steps/types";

function LazyStepsWizard(props: { onRecreate: () => void }) {
	const [loadError, setLoadError] = createSignal<string | null>(null);
	const [failureArmed, setFailureArmed] = createSignal(false);

	const wizard = createWizard<LazyDemoData>({
		definition: createLazyStepsWizard(),
		initialData: lazyInitialData,
		onError: (error) => {
			if (error instanceof WizardStepLoadError) {
				const cause = error.cause instanceof Error ? error.cause.message : "";
				setLoadError(
					`${error.message}${cause ? ` — ${cause}` : ""} — click Next to retry.`,
				);
				setFailureArmed(false);
			}
		},
		onStepEnter: () => setLoadError(null),
		onComplete: (data) => alert(`Done: ${JSON.stringify(data)}`),
	});

	const email = wizard.field("email");
	const passport = wizard.field("passport");

	const next = () => {
		setLoadError(null);
		void wizard.goNext().catch(() => {});
	};
	const prefetch = () => {
		// Skipped while a failure is armed: a silent preload would consume it.
		if (wizard.currentStepId === "account" && !failureArmed()) {
			void wizard.actions.preloadStep("documents").catch(() => {});
		}
	};

	return (
		<section class="panel">
			<h2>{wizard.currentStep.meta?.title}</h2>
			<p class="description">{wizard.currentStep.meta?.description}</p>

			<Show when={wizard.isLoadingStep}>
				<p class="description" role="status">
					Loading step implementation…
				</p>
			</Show>
			<Show when={loadError()}>
				{(message) => (
					<p class="error" role="alert">
						{message()}
					</p>
				)}
			</Show>

			<Switch>
				<Match when={wizard.currentStepId === "account"}>
					<label>
						<span>Email</span>
						<input
							value={email.value}
							onInput={(e) => {
								email.value = e.currentTarget.value;
							}}
							placeholder="ada@example.com"
						/>
					</label>
				</Match>
				<Match when={wizard.currentStepId === "documents"}>
					<label>
						<span>Passport number</span>
						<input
							value={passport.value}
							onInput={(e) => {
								passport.value = e.currentTarget.value;
							}}
							placeholder="AB1234567"
						/>
					</label>
				</Match>
				<Match when={wizard.currentStepId === "summary"}>
					<pre class="debug">{JSON.stringify(wizard.data, null, 2)}</pre>
				</Match>
			</Switch>

			<For each={Object.entries(wizard.validationErrors ?? {})}>
				{([, message]) => <p class="error">{message}</p>}
			</For>

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
							onClick={next}
							onMouseEnter={prefetch}
							disabled={wizard.isNavigating}
						>
							{wizard.isLoadingStep ? "Loading…" : "Next"}
						</button>
					}
				>
					<button
						type="button"
						onClick={() => void wizard.actions.submit().catch(() => {})}
					>
						Finish
					</button>
				</Show>
				<span class="spacer" />
				<button
					type="button"
					class="secondary"
					onClick={() => {
						armLoadFailure();
						setFailureArmed(true);
					}}
				>
					{failureArmed() ? "Next load will fail" : "Fail next load"}
				</button>
				<button
					type="button"
					class="secondary"
					onClick={() => props.onRecreate()}
				>
					Recreate wizard
				</button>
			</div>

			<p class="description">
				A loaded step is cached per wizard; hovering “Next” on the first step
				prefetches it with <code>preloadStep</code>. “Fail next load” only
				matters before the step has loaded once — recreate the wizard to try it
				again.
			</p>
		</section>
	);
}

export function LazyStepsExample() {
	const [generation, setGeneration] = createSignal(1);
	return (
		<Show when={generation()} keyed>
			{(_generation) => (
				<LazyStepsWizard onRecreate={() => setGeneration((g) => g + 1)} />
			)}
		</Show>
	);
}
