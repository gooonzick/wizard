import type { WizardDefinition, WizardPlugin } from "@gooonzick/wizard-core";
import {
	createContext,
	type ReactNode,
	StrictMode,
	useCallback,
	useContext,
	useState,
} from "react";
import {
	type UseWizardReturn,
	useWizard,
	useWizardActions,
	useWizardData,
	useWizardField,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
	WizardProvider,
} from "../../src";
import {
	initialRegistrationData,
	type RegistrationData,
	type RegistrationStepId,
	STEP_IDS,
	STEP_TITLES,
} from "./fixtures/registration-wizard";

type Data = RegistrationData;

export interface RegistrationWizardProps {
	definition: WizardDefinition<Data>;
	initialData?: Data;
	plugins?: WizardPlugin<Data>[];
	/** When set, a "Load preset" button calls `actions.reset(presetData)`. */
	presetData?: Data;
	onComplete?: (data: Data) => void;
	onCancel?: (data: Data) => void | Promise<void>;
	onError?: (error: Error) => void;
	/** Every rejection caught by a button handler, before filtering. */
	onActionError?: (error: unknown) => void;
}

// ── error handling ──────────────────────────────────────────────────

/**
 * Errors the banner deliberately does not show: validation failures are
 * rendered per field, and a busy rejection (double click) is not a user-facing
 * failure — the first navigation is still in flight.
 */
function isQuietError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === "WizardValidationError") return true;
	return (
		error.name === "WizardNavigationError" &&
		(error as Error & { reason?: string }).reason === "busy"
	);
}

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Banner state fed by BOTH the wizard's onError and caught action rejections. */
function useErrorBanner(
	onErrorProp?: (error: Error) => void,
	onActionError?: (error: unknown) => void,
) {
	const [message, setMessage] = useState("");
	const clear = useCallback(() => setMessage(""), []);
	const report = useCallback((error: unknown) => {
		if (!isQuietError(error)) setMessage(toMessage(error));
	}, []);
	const onError = useCallback(
		(error: Error) => {
			onErrorProp?.(error);
			report(error);
		},
		[onErrorProp, report],
	);
	const run = useCallback(
		async (action: () => Promise<void>) => {
			clear();
			try {
				await action();
			} catch (error) {
				onActionError?.(error);
				report(error);
			}
		},
		[clear, report, onActionError],
	);
	return { message, clear, onError, run };
}

// ── presentational pieces (shared by both variants) ─────────────────

function StepIndicator(props: {
	currentStepId: string;
	statuses: Record<string, string>;
	percentage: number;
}) {
	return (
		<nav aria-label="Wizard progress">
			<ol>
				{STEP_IDS.map((id) => (
					<li
						key={id}
						data-testid={`step-${id}`}
						data-status={props.statuses[id]}
						aria-current={id === props.currentStepId ? "step" : undefined}
					>
						{STEP_TITLES[id]}
					</li>
				))}
			</ol>
			<p data-testid="progress">{props.percentage}%</p>
		</nav>
	);
}

function FieldError(props: { field: string; message?: string }) {
	if (!props.message) return null;
	return <p data-testid={`error-${props.field}`}>{props.message}</p>;
}

function ErrorBanner(props: { message: string }) {
	return (
		<div role="alert" data-testid="wizard-error">
			{props.message}
		</div>
	);
}

function CompletionScreen(props: { data: Data }) {
	return (
		<section data-testid="completion">
			<h2>Registration complete</h2>
			<p>Welcome, {props.data.name}!</p>
		</section>
	);
}

interface ControlsProps {
	isLastStep: boolean;
	backDisabled: boolean;
	nextDisabled: boolean;
	onBack: () => void;
	onNext: () => void;
	onReset: () => void;
	onCancel: () => void;
	onLoadPreset?: () => void;
}

function Controls(props: ControlsProps) {
	return (
		<div>
			<button
				type="button"
				data-testid="back"
				disabled={props.backDisabled}
				onClick={props.onBack}
			>
				Back
			</button>
			<button
				type="button"
				data-testid="next"
				disabled={props.nextDisabled}
				onClick={props.onNext}
			>
				{props.isLastStep ? "Finish" : "Next"}
			</button>
			<button type="button" data-testid="reset" onClick={props.onReset}>
				Reset
			</button>
			<button type="button" data-testid="cancel" onClick={props.onCancel}>
				Cancel
			</button>
			{props.onLoadPreset ? (
				<button type="button" data-testid="preset" onClick={props.onLoadPreset}>
					Load preset
				</button>
			) : null}
		</div>
	);
}

// ── field binding: one component per variant, same props ───────────

type FieldProps<K extends keyof Data> = {
	field: K;
	children: (value: Data[K], setValue: (value: Data[K]) => void) => ReactNode;
};
type FieldComponent = <K extends keyof Data>(props: FieldProps<K>) => ReactNode;

const HookWizardContext = createContext<UseWizardReturn<Data> | null>(null);

/** Direct mode: `useWizardField(wizard, field)` against the useWizard() return. */
function HookField<K extends keyof Data>(props: FieldProps<K>) {
	const wizard = useContext(HookWizardContext);
	if (!wizard) throw new Error("HookField outside RegistrationWizardHook");
	const [value, setValue] = useWizardField(wizard, props.field);
	return <>{props.children(value, setValue)}</>;
}

/** Provider mode: `useWizardField(field)` against the shared manager. */
function ProviderField<K extends keyof Data>(props: FieldProps<K>) {
	const [value, setValue] = useWizardField<Data, K>(props.field);
	return <>{props.children(value, setValue)}</>;
}

function AccountTypeSelect(props: {
	Field: FieldComponent;
	id: string;
	error?: string;
}) {
	const { Field } = props;
	return (
		<Field field="accountType">
			{(value, setValue) => (
				<div>
					<label htmlFor={props.id}>Account type</label>
					<select
						id={props.id}
						value={value}
						onChange={(e) => setValue(e.target.value as Data["accountType"])}
					>
						<option value="">Select…</option>
						<option value="personal">Personal</option>
						<option value="business">Business</option>
					</select>
					<FieldError field="accountType" message={props.error} />
				</div>
			)}
		</Field>
	);
}

function TextField(props: {
	Field: FieldComponent;
	field: "name" | "email" | "company";
	label: string;
	error?: string;
}) {
	const { Field } = props;
	return (
		<Field field={props.field}>
			{(value, setValue) => (
				<div>
					<label htmlFor={`field-${props.field}`}>{props.label}</label>
					<input
						id={`field-${props.field}`}
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
					<FieldError field={props.field} message={props.error} />
				</div>
			)}
		</Field>
	);
}

/** Current step's inputs + field errors. */
function StepFields(props: {
	stepId: string;
	data: Data;
	errors?: Record<string, string>;
	Field: FieldComponent;
}) {
	const { Field, errors = {} } = props;
	const stepId = props.stepId as RegistrationStepId;
	let body: ReactNode = null;
	if (stepId === "personal") {
		body = (
			<>
				<TextField
					Field={Field}
					field="name"
					label="Name"
					error={errors.name}
				/>
				<TextField
					Field={Field}
					field="email"
					label="Email"
					error={errors.email}
				/>
			</>
		);
	} else if (stepId === "account") {
		body = (
			<AccountTypeSelect
				Field={Field}
				id="account-type"
				error={errors.accountType}
			/>
		);
	} else if (stepId === "company") {
		body = (
			<TextField
				Field={Field}
				field="company"
				label="Company"
				error={errors.company}
			/>
		);
	} else if (stepId === "review") {
		body = (
			<>
				<dl data-testid="summary">
					<dt>Name</dt>
					<dd data-testid="summary-name">{props.data.name}</dd>
					<dt>Email</dt>
					<dd data-testid="summary-email">{props.data.email}</dd>
					<dt>Company</dt>
					<dd data-testid="summary-company">{props.data.company}</dd>
				</dl>
				{/* Editable on review, so the branch can change after the fact. */}
				<AccountTypeSelect
					Field={Field}
					id="review-account-type"
					error={errors.accountType}
				/>
				<Field field="agree">
					{(value, setValue) => (
						<div>
							<input
								id="field-agree"
								type="checkbox"
								checked={value}
								onChange={(e) => setValue(e.target.checked)}
							/>
							<label htmlFor="field-agree">I agree to the terms</label>
							<FieldError field="agree" message={errors.agree} />
						</div>
					)}
				</Field>
			</>
		);
	}
	return (
		<section data-testid={`panel-${stepId}`}>
			<h2>{STEP_TITLES[stepId]}</h2>
			{body}
		</section>
	);
}

// ── variant 1: a single useWizard() call ────────────────────────────

export function RegistrationWizardHook(props: RegistrationWizardProps) {
	const banner = useErrorBanner(props.onError, props.onActionError);
	const wizard = useWizard<Data>({
		definition: props.definition,
		initialData: props.initialData ?? initialRegistrationData,
		plugins: props.plugins,
		onComplete: props.onComplete,
		onCancel: props.onCancel,
		onError: banner.onError,
	});
	const { state, validation, navigation, loading, actions } = wizard;
	const { presetData } = props;
	const { run } = banner;

	return (
		<HookWizardContext.Provider value={wizard}>
			<StepIndicator
				currentStepId={state.currentStepId}
				statuses={state.stepStatuses}
				percentage={state.progress.percentage}
			/>
			<ErrorBanner message={banner.message} />
			{state.isCompleted ? (
				<CompletionScreen data={state.data} />
			) : (
				<>
					<StepFields
						stepId={state.currentStepId}
						data={state.data}
						errors={validation.validationErrors}
						Field={HookField}
					/>
					<Controls
						isLastStep={navigation.isLastStep}
						backDisabled={!navigation.canGoPrevious || loading.isNavigating}
						nextDisabled={loading.isNavigating}
						onBack={() => void run(navigation.goPrevious)}
						onNext={() =>
							void run(
								navigation.isLastStep ? actions.submit : navigation.goNext,
							)
						}
						onReset={() => {
							banner.clear();
							actions.reset();
						}}
						onCancel={() => void run(actions.cancel)}
						onLoadPreset={
							presetData ? () => actions.reset(presetData) : undefined
						}
					/>
				</>
			)}
		</HookWizardContext.Provider>
	);
}

// ── variant 2: <WizardProvider> + granular hooks per child ──────────

type Run = (action: () => Promise<void>) => Promise<void>;

function ProviderStepIndicator() {
	const { currentStepId, stepStatuses, progress } = useWizardData<Data>();
	return (
		<StepIndicator
			currentStepId={currentStepId}
			statuses={stepStatuses}
			percentage={progress.percentage}
		/>
	);
}

function ProviderStepBody() {
	const { currentStepId, data } = useWizardData<Data>();
	const { validationErrors } = useWizardValidation();
	return (
		<StepFields
			stepId={currentStepId}
			data={data}
			errors={validationErrors}
			Field={ProviderField}
		/>
	);
}

function ProviderControls(props: {
	run: Run;
	clearBanner: () => void;
	presetData?: Data;
}) {
	const navigation = useWizardNavigation();
	const { isNavigating } = useWizardLoading();
	const actions = useWizardActions<Data>();
	const { run, presetData } = props;
	return (
		<Controls
			isLastStep={navigation.isLastStep}
			backDisabled={!navigation.canGoPrevious || isNavigating}
			nextDisabled={isNavigating}
			onBack={() => void run(navigation.goPrevious)}
			onNext={() =>
				void run(navigation.isLastStep ? actions.submit : navigation.goNext)
			}
			onReset={() => {
				props.clearBanner();
				actions.reset();
			}}
			onCancel={() => void run(actions.cancel)}
			onLoadPreset={presetData ? () => actions.reset(presetData) : undefined}
		/>
	);
}

function ProviderMain(props: {
	run: Run;
	clearBanner: () => void;
	presetData?: Data;
}) {
	const { isCompleted, data } = useWizardData<Data>();
	if (isCompleted) return <CompletionScreen data={data} />;
	return (
		<>
			<ProviderStepBody />
			<ProviderControls
				run={props.run}
				clearBanner={props.clearBanner}
				presetData={props.presetData}
			/>
		</>
	);
}

export function RegistrationWizardProvider(props: RegistrationWizardProps) {
	const banner = useErrorBanner(props.onError, props.onActionError);
	return (
		<WizardProvider<Data>
			definition={props.definition}
			initialData={props.initialData ?? initialRegistrationData}
			plugins={props.plugins}
			onComplete={props.onComplete}
			onCancel={props.onCancel}
			onError={banner.onError}
		>
			<ProviderStepIndicator />
			<ErrorBanner message={banner.message} />
			<ProviderMain
				run={banner.run}
				clearBanner={banner.clear}
				presetData={props.presetData}
			/>
		</WizardProvider>
	);
}

// ── variants table + render helper ──────────────────────────────────

export type RegistrationWizardComponent = (
	props: RegistrationWizardProps,
) => ReactNode;

export const variants: ReadonlyArray<{
	name: string;
	Component: RegistrationWizardComponent;
}> = [
	{ name: "useWizard", Component: RegistrationWizardHook },
	{ name: "WizardProvider", Component: RegistrationWizardProvider },
];

/** Wraps the element in <StrictMode> when `strict` is set. */
export function maybeStrict(element: ReactNode, strict: boolean): ReactNode {
	return strict ? <StrictMode>{element}</StrictMode> : element;
}
