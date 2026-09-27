import {
	type StepId,
	type WizardDefinition,
	WizardNavigationError,
	type WizardPlugin,
	WizardValidationError,
} from "@gooonzick/wizard-core";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";
import {
	createWizard,
	useWizardContext,
	type Wizard,
	WizardProvider,
} from "../../../src/index";
import {
	createInitialData,
	type RegistrationData,
	STEP_IDS,
	STEP_TITLES,
} from "./registration";

export type Variant = "direct" | "provider";

export const VARIANTS: Variant[] = ["direct", "provider"];

export interface RegistrationWizardProps {
	/** "direct": parts receive the wizard as a prop; "provider": via useWizardContext(). */
	variant: Variant;
	definition: WizardDefinition<RegistrationData>;
	initialData?: RegistrationData;
	plugins?: WizardPlugin<RegistrationData>[];
	onComplete?: (data: RegistrationData) => void;
	onCancel?: (data: RegistrationData) => void | Promise<void>;
	onError?: (error: Error) => void;
	onStepEnter?: (stepId: StepId, data: RegistrationData) => void;
	/** Called from each step body's setup, i.e. once per mount of that step's UI. */
	onStepRender?: (stepId: StepId) => void;
	/** Renders a "Load sample" button calling `actions.reset(sampleData)`. */
	sampleData?: RegistrationData;
	/** A user `createEffect` throws "effect boom" while currentStepId equals this. */
	throwInEffectOn?: StepId;
	/** Receives the component-owned wizard (for teardown assertions only). */
	onReady?: (wizard: Wizard<RegistrationData>) => void;
}

type RunAction = (action: () => Promise<void>) => void;

interface PartProps {
	wizard: Wizard<RegistrationData>;
}

/**
 * Validation failures are shown per field and "busy" rejections are a UI race
 * (the button is already disabled), so neither belongs in the error area.
 */
function isSilent(error: unknown): boolean {
	return (
		error instanceof WizardValidationError ||
		(error instanceof WizardNavigationError && error.reason === "busy")
	);
}

export function RegistrationWizard(props: RegistrationWizardProps) {
	const [errors, setErrors] = createSignal<string[]>([]);
	// One failure can arrive twice (onError AND the rejected action promise).
	const seen = new WeakSet<object>();
	const report = (error: unknown): void => {
		if (isSilent(error)) return;
		const err = error instanceof Error ? error : new Error(String(error));
		if (seen.has(err)) return;
		seen.add(err);
		setErrors((prev) => [...prev, err.message]);
	};

	// Created inside the component: autoDestroy binds it to this owner.
	const wizard = createWizard<RegistrationData>({
		definition: props.definition,
		initialData: props.initialData ?? createInitialData(),
		plugins: props.plugins,
		onComplete: (data) => props.onComplete?.(data),
		onCancel: (data) => props.onCancel?.(data),
		onStepEnter: (stepId, data) => props.onStepEnter?.(stepId, data),
		onError: (error) => {
			props.onError?.(error);
			report(error);
		},
	});
	props.onReady?.(wizard);

	createEffect(() => {
		if (
			props.throwInEffectOn !== undefined &&
			wizard.currentStepId === props.throwInEffectOn
		) {
			throw new Error("effect boom");
		}
	});

	const run: RunAction = (action) => {
		setErrors([]);
		void action().catch(report);
	};

	return (
		<main>
			<ul aria-label="Errors">
				<For each={errors()}>
					{(message) => <li role="alert">{message}</li>}
				</For>
			</ul>
			<Show
				when={props.variant === "provider"}
				fallback={
					<WizardBody
						wizard={wizard}
						run={run}
						sampleData={props.sampleData}
						onStepRender={props.onStepRender}
					/>
				}
			>
				<WizardProvider wizard={wizard}>
					<ContextBody
						run={run}
						sampleData={props.sampleData}
						onStepRender={props.onStepRender}
					/>
				</WizardProvider>
			</Show>
		</main>
	);
}

interface BodyOptions {
	run: RunAction;
	sampleData?: RegistrationData;
	onStepRender?: (stepId: StepId) => void;
}

// ---- direct variant: every part receives the wizard as a prop ----

function WizardBody(props: PartProps & BodyOptions) {
	return (
		<Show
			when={!props.wizard.isCompleted}
			fallback={<Completion wizard={props.wizard} />}
		>
			<StepIndicator wizard={props.wizard} />
			<StepFields wizard={props.wizard} onStepRender={props.onStepRender} />
			<Controls
				wizard={props.wizard}
				run={props.run}
				sampleData={props.sampleData}
			/>
		</Show>
	);
}

// ---- provider variant: every part reads the wizard from context ----

function ContextBody(props: BodyOptions) {
	const wizard = useWizardContext<RegistrationData>();
	return (
		<Show when={!wizard.isCompleted} fallback={<ContextCompletion />}>
			<ContextIndicator />
			<ContextFields onStepRender={props.onStepRender} />
			<ContextControls run={props.run} sampleData={props.sampleData} />
		</Show>
	);
}

// NB: read the context in the component body. Inline in JSX
// (`wizard={useWizardContext()}`) it would compile to a lazy prop getter that
// runs later, outside the owner, where the context is gone.
function ContextIndicator() {
	const wizard = useWizardContext<RegistrationData>();
	return <StepIndicator wizard={wizard} />;
}

function ContextFields(props: { onStepRender?: (stepId: StepId) => void }) {
	const wizard = useWizardContext<RegistrationData>();
	return <StepFields wizard={wizard} onStepRender={props.onStepRender} />;
}

function ContextControls(props: {
	run: RunAction;
	sampleData?: RegistrationData;
}) {
	const wizard = useWizardContext<RegistrationData>();
	return (
		<Controls wizard={wizard} run={props.run} sampleData={props.sampleData} />
	);
}

function ContextCompletion() {
	const wizard = useWizardContext<RegistrationData>();
	return <Completion wizard={wizard} />;
}

// ---- shared parts ----

function StepIndicator(props: PartProps) {
	return (
		<nav>
			<ol aria-label="Steps">
				<For each={STEP_IDS}>
					{(id) => (
						<li
							data-testid={`step-${id}`}
							data-status={props.wizard.stepStatuses[id]}
						>
							{STEP_TITLES[id]}
						</li>
					)}
				</For>
			</ol>
			<p data-testid="progress">{props.wizard.progress.percentage}%</p>
		</nav>
	);
}

function FieldError(props: PartProps & { field: keyof RegistrationData }) {
	return (
		<Show when={props.wizard.validationErrors?.[props.field]}>
			{(message) => <p data-testid={`error-${props.field}`}>{message()}</p>}
		</Show>
	);
}

function StepFields(
	props: PartProps & { onStepRender?: (stepId: StepId) => void },
) {
	return (
		<section>
			<h2>{String(props.wizard.currentStep.meta?.title ?? "")}</h2>
			<Switch>
				<Match when={props.wizard.currentStepId === "personal"}>
					<PersonalStep
						wizard={props.wizard}
						onStepRender={props.onStepRender}
					/>
				</Match>
				<Match when={props.wizard.currentStepId === "account"}>
					<AccountStep
						wizard={props.wizard}
						onStepRender={props.onStepRender}
					/>
				</Match>
				<Match when={props.wizard.currentStepId === "company"}>
					<CompanyStep
						wizard={props.wizard}
						onStepRender={props.onStepRender}
					/>
				</Match>
				<Match when={props.wizard.currentStepId === "review"}>
					<ReviewStep wizard={props.wizard} onStepRender={props.onStepRender} />
				</Match>
			</Switch>
		</section>
	);
}

type StepProps = PartProps & { onStepRender?: (stepId: StepId) => void };

function PersonalStep(props: StepProps) {
	props.onStepRender?.("personal");
	const name = props.wizard.field("name");
	const email = props.wizard.field("email");
	return (
		<>
			<label>
				Name
				<input
					value={name.value}
					onInput={(e) => {
						name.value = e.currentTarget.value;
					}}
				/>
			</label>
			<FieldError wizard={props.wizard} field="name" />
			<label>
				Email
				<input
					value={email.value}
					onInput={(e) => {
						email.value = e.currentTarget.value;
					}}
				/>
			</label>
			<FieldError wizard={props.wizard} field="email" />
		</>
	);
}

function AccountTypeSelect(props: PartProps & { label: string }) {
	const accountType = props.wizard.field("accountType");
	return (
		<label>
			{props.label}
			<select
				value={accountType.value}
				onChange={(e) => {
					accountType.value = e.currentTarget
						.value as RegistrationData["accountType"];
				}}
			>
				<option value="">Choose one</option>
				<option value="personal">Personal account</option>
				<option value="business">Business account</option>
			</select>
		</label>
	);
}

function AccountStep(props: StepProps) {
	props.onStepRender?.("account");
	return (
		<>
			<AccountTypeSelect wizard={props.wizard} label="Account type" />
			<FieldError wizard={props.wizard} field="accountType" />
		</>
	);
}

function CompanyStep(props: StepProps) {
	props.onStepRender?.("company");
	const company = props.wizard.field("company");
	return (
		<>
			<label>
				Company
				<input
					value={company.value}
					onInput={(e) => {
						company.value = e.currentTarget.value;
					}}
				/>
			</label>
			<FieldError wizard={props.wizard} field="company" />
		</>
	);
}

function ReviewStep(props: StepProps) {
	props.onStepRender?.("review");
	const agree = props.wizard.field("agree");
	return (
		<>
			<dl>
				<dt>Name</dt>
				<dd data-testid="summary-name">{props.wizard.data.name}</dd>
				<dt>Email</dt>
				<dd data-testid="summary-email">{props.wizard.data.email}</dd>
			</dl>
			<AccountTypeSelect wizard={props.wizard} label="Change account type" />
			<label>
				<input
					type="checkbox"
					checked={agree.value}
					onChange={(e) => {
						agree.value = e.currentTarget.checked;
					}}
				/>
				I agree to the terms
			</label>
			<FieldError wizard={props.wizard} field="agree" />
		</>
	);
}

function Controls(
	props: PartProps & { run: RunAction; sampleData?: RegistrationData },
) {
	const isLast = () => props.wizard.progress.isLastStep;
	return (
		<div>
			<button
				type="button"
				disabled={!props.wizard.canGoPrevious || props.wizard.isNavigating}
				onClick={() => props.run(() => props.wizard.goPrevious())}
			>
				Back
			</button>
			<button
				type="button"
				data-testid="next"
				disabled={props.wizard.isNavigating || props.wizard.isSubmitting}
				onClick={() =>
					props.run(() =>
						isLast() ? props.wizard.actions.submit() : props.wizard.goNext(),
					)
				}
			>
				{isLast() ? "Finish" : "Next"}
			</button>
			<button type="button" onClick={() => props.wizard.actions.reset()}>
				Reset
			</button>
			<Show when={props.sampleData}>
				{(sample) => (
					<button
						type="button"
						onClick={() => props.wizard.actions.reset(sample())}
					>
						Load sample
					</button>
				)}
			</Show>
			<button
				type="button"
				onClick={() => props.run(() => props.wizard.actions.cancel())}
			>
				Cancel
			</button>
		</div>
	);
}

function Completion(props: PartProps) {
	return (
		<section>
			<h2>Registration complete</h2>
			<p data-testid="welcome">Welcome, {props.wizard.data.name}</p>
		</section>
	);
}
