import type {
	StepId,
	WizardDefinition,
	WizardPlugin,
} from "@gooonzick/wizard-core";
import {
	WizardNavigationError,
	WizardValidationError,
} from "@gooonzick/wizard-core";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
	defineComponent,
	h,
	type PropType,
	type ShallowRef,
	shallowRef,
	toRaw,
	type VNode,
	type WritableComputedRef,
} from "vue";
import type {
	UseWizardActions,
	UseWizardLoading,
	UseWizardNavigation,
	UseWizardState,
	UseWizardValidation,
} from "../../../src/types";
import { useWizard } from "../../../src/use-wizard";
import { useWizardField } from "../../../src/use-wizard-granular";
import { createTypedWizardProvider } from "../../../src/wizard-provider";
import {
	emptyRegistration,
	type RegistrationData,
	STEP_IDS,
} from "./registration-definition";

// ─── Error feed ─────────────────────────────────────────────────────────────
// Fed by the `onError` option AND by errors caught from navigation actions.
// Validation errors are shown inline next to the fields instead, and a
// "busy" rejection (double click) is not an error the user needs to see.
// Deduped by identity: the machine may report the same Error through several
// channels (e.g. a throwing guard).

export interface ErrorFeed {
	errors: ShallowRef<Error[]>;
	report: (error: unknown) => void;
	clear: () => void;
}

export function createErrorFeed(): ErrorFeed {
	const errors = shallowRef<Error[]>([]);
	return {
		errors,
		report(error) {
			if (error instanceof WizardValidationError) return;
			if (error instanceof WizardNavigationError && error.reason === "busy") {
				return;
			}
			const err = error instanceof Error ? error : new Error(String(error));
			if (errors.value.includes(err)) return;
			errors.value = [...errors.value, err];
		},
		clear() {
			errors.value = [];
		},
	};
}

// ─── Render pieces shared by both variants (identical DOM) ──────────────────

type FieldBindings = {
	[K in keyof RegistrationData]: WritableComputedRef<RegistrationData[K]>;
};

function renderIndicator(state: UseWizardState<RegistrationData>): VNode {
	return h("nav", { "data-testid": "indicator" }, [
		h(
			"ol",
			STEP_IDS.map((id) =>
				h(
					"li",
					{
						key: id,
						"data-step": id,
						"data-status": state.stepStatuses.value[id],
						"aria-current":
							state.currentStepId.value === id ? "step" : undefined,
					},
					id,
				),
			),
		),
		h(
			"p",
			{ "data-testid": "progress" },
			`${state.progress.value.percentage}%`,
		),
	]);
}

function textField(
	field: "name" | "email" | "company",
	binding: WritableComputedRef<string>,
	validation: UseWizardValidation,
): VNode[] {
	const error = validation.validationErrors.value?.[field];
	return [
		h("label", { for: field }, field),
		h("input", {
			id: field,
			"data-testid": `input-${field}`,
			value: binding.value,
			onInput: (event: Event) => {
				binding.value = (event.target as HTMLInputElement).value;
			},
		}),
		error ? h("p", { "data-testid": `error-${field}` }, error) : null,
	].filter((node): node is VNode => node !== null);
}

function fieldError(
	validation: UseWizardValidation,
	field: keyof RegistrationData & string,
): VNode | null {
	const error = validation.validationErrors.value?.[field];
	return error ? h("p", { "data-testid": `error-${field}` }, error) : null;
}

function renderStepFields(
	stepId: StepId,
	fields: FieldBindings,
	validation: UseWizardValidation,
): VNode {
	let children: (VNode | null)[] = [];
	if (stepId === "personal") {
		children = [
			...textField("name", fields.name, validation),
			...textField("email", fields.email, validation),
		];
	} else if (stepId === "account") {
		children = [
			...(["personal", "business"] as const).map((type) =>
				h("label", { key: type }, [
					h("input", {
						type: "radio",
						name: "accountType",
						value: type,
						"data-testid": `account-${type}`,
						checked: fields.accountType.value === type,
						onChange: () => {
							fields.accountType.value = type;
						},
					}),
					type,
				]),
			),
			fieldError(validation, "accountType"),
		];
	} else if (stepId === "company") {
		children = textField("company", fields.company, validation);
	} else if (stepId === "review") {
		children = [
			h(
				"p",
				{ "data-testid": "summary" },
				`${fields.name.value} <${fields.email.value}> ${fields.accountType.value}${fields.company.value ? ` @ ${fields.company.value}` : ""}`,
			),
			h("label", [
				h("input", {
					type: "checkbox",
					"data-testid": "input-agree",
					checked: fields.agree.value,
					onChange: (event: Event) => {
						fields.agree.value = (event.target as HTMLInputElement).checked;
					},
				}),
				"I agree",
			]),
			fieldError(validation, "agree"),
		];
	}
	return h("section", { "data-testid": "step", "data-step": stepId }, children);
}

interface ControlHandlers {
	next: () => Promise<void>;
	back: () => Promise<void>;
	reset: () => void;
	resetToPreset: (() => void) | null;
	cancel: () => Promise<void>;
}

function createHandlers(
	navigation: UseWizardNavigation,
	actions: UseWizardActions<RegistrationData>,
	feed: ErrorFeed,
	preset: RegistrationData | undefined,
): ControlHandlers {
	return {
		async next() {
			feed.clear();
			try {
				if (navigation.isLastStep.value) {
					await actions.submit();
				} else {
					await navigation.goNext();
				}
			} catch (error) {
				feed.report(error);
			}
		},
		async back() {
			feed.clear();
			try {
				await navigation.goPrevious();
			} catch (error) {
				feed.report(error);
			}
		},
		reset() {
			feed.clear();
			actions.reset();
		},
		resetToPreset: preset
			? () => {
					feed.clear();
					actions.reset(preset);
				}
			: null,
		async cancel() {
			feed.clear();
			try {
				await actions.cancel();
			} catch (error) {
				feed.report(error);
			}
		},
	};
}

function renderControls(
	navigation: UseWizardNavigation,
	loading: UseWizardLoading,
	handlers: ControlHandlers,
): VNode {
	const busy = loading.isNavigating.value || loading.isSubmitting.value;
	return h("div", { "data-testid": "controls" }, [
		h(
			"button",
			{
				type: "button",
				"data-testid": "back",
				disabled: !navigation.canGoPrevious.value || loading.isNavigating.value,
				onClick: handlers.back,
			},
			"Back",
		),
		h(
			"button",
			{
				type: "button",
				"data-testid": "next",
				disabled: busy,
				onClick: handlers.next,
			},
			navigation.isLastStep.value ? "Finish" : "Next",
		),
		h(
			"button",
			{ type: "button", "data-testid": "reset", onClick: handlers.reset },
			"Reset",
		),
		handlers.resetToPreset
			? h(
					"button",
					{
						type: "button",
						"data-testid": "reset-preset",
						onClick: handlers.resetToPreset,
					},
					"Reset to preset",
				)
			: null,
		h(
			"button",
			{ type: "button", "data-testid": "cancel", onClick: handlers.cancel },
			"Cancel",
		),
	]);
}

function renderCompletion(state: UseWizardState<RegistrationData>): VNode {
	return h(
		"section",
		{ "data-testid": "complete" },
		`Welcome, ${state.data.value.name}!`,
	);
}

function renderErrors(feed: ErrorFeed): VNode {
	return h(
		"ul",
		{ "data-testid": "errors", role: "alert" },
		feed.errors.value.map((error, index) =>
			h("li", { key: index }, error.message),
		),
	);
}

// ─── Props shared by both variants ──────────────────────────────────────────

export interface RegistrationProps {
	definition: WizardDefinition<RegistrationData>;
	initialData?: RegistrationData;
	plugins?: WizardPlugin<RegistrationData>[];
	/** When set, renders a "Reset to preset" button calling `reset(preset)`. */
	preset?: RegistrationData;
	onComplete?: (data: RegistrationData) => void;
	onCancel?: (data: RegistrationData) => void | Promise<void>;
	onError?: (error: Error) => void;
	onStepEnter?: (stepId: StepId, data: RegistrationData) => void;
}

const registrationProps = {
	definition: {
		type: Object as PropType<WizardDefinition<RegistrationData>>,
		required: true as const,
	},
	initialData: Object as PropType<RegistrationData>,
	plugins: Array as PropType<WizardPlugin<RegistrationData>[]>,
	preset: Object as PropType<RegistrationData>,
	onComplete: Function as PropType<(data: RegistrationData) => void>,
	onCancel: Function as PropType<
		(data: RegistrationData) => void | Promise<void>
	>,
	onError: Function as PropType<(error: Error) => void>,
	onStepEnter: Function as PropType<
		(stepId: StepId, data: RegistrationData) => void
	>,
};

/**
 * `mount()` stores props in a deep `reactive()`, so object props arrive as
 * Vue proxies. The machine deep-clones data with `structuredClone`, which
 * rejects proxies, so unwrap them the way `WizardProvider` does (and the way
 * an app passing reactive state has to).
 */
function rawInputs(props: RegistrationProps) {
	return {
		definition: toRaw(props.definition),
		initialData: props.initialData
			? toRaw(props.initialData)
			: emptyRegistration(),
		plugins: props.plugins ? toRaw(props.plugins) : undefined,
		preset: props.preset ? toRaw(props.preset) : undefined,
	};
}

// ─── Variant 1: a single component driving useWizard() directly ─────────────

export const RegistrationWizardDirect = defineComponent({
	name: "RegistrationWizardDirect",
	props: registrationProps,
	setup(props) {
		const feed = createErrorFeed();
		const raw = rawInputs(props);
		const wizard = useWizard<RegistrationData>({
			definition: raw.definition,
			initialData: raw.initialData,
			plugins: raw.plugins,
			onComplete: props.onComplete,
			onCancel: props.onCancel,
			onStepEnter: props.onStepEnter,
			onError: (error) => {
				props.onError?.(error);
				feed.report(error);
			},
		});
		const fields: FieldBindings = {
			name: useWizardField(wizard, "name"),
			email: useWizardField(wizard, "email"),
			accountType: useWizardField(wizard, "accountType"),
			company: useWizardField(wizard, "company"),
			agree: useWizardField(wizard, "agree"),
		};
		const handlers = createHandlers(
			wizard.navigation,
			wizard.actions,
			feed,
			raw.preset,
		);

		return () =>
			h("div", { class: "registration" }, [
				renderIndicator(wizard.state),
				wizard.state.isCompleted.value
					? renderCompletion(wizard.state)
					: h("div", [
							renderStepFields(
								wizard.state.currentStepId.value,
								fields,
								wizard.validation,
							),
							renderControls(wizard.navigation, wizard.loading, handlers),
						]),
				renderErrors(feed),
			]);
	},
});

// ─── Variant 2: typed provider + granular child components ──────────────────

const {
	Provider,
	useData,
	useActions,
	useNavigation,
	useValidation,
	useLoading,
} = createTypedWizardProvider<RegistrationData>();

const feedProp = {
	type: Object as PropType<ErrorFeed>,
	required: true as const,
};

const IndicatorPanel = defineComponent({
	name: "IndicatorPanel",
	setup() {
		const state = useData();
		return () => renderIndicator(state);
	},
});

const StepPanel = defineComponent({
	name: "StepPanel",
	setup() {
		const state = useData();
		const validation = useValidation();
		const fields: FieldBindings = {
			name: useWizardField<RegistrationData, "name">("name"),
			email: useWizardField<RegistrationData, "email">("email"),
			accountType: useWizardField<RegistrationData, "accountType">(
				"accountType",
			),
			company: useWizardField<RegistrationData, "company">("company"),
			agree: useWizardField<RegistrationData, "agree">("agree"),
		};
		return () =>
			renderStepFields(state.currentStepId.value, fields, validation);
	},
});

const ControlsPanel = defineComponent({
	name: "ControlsPanel",
	props: {
		feed: feedProp,
		preset: Object as PropType<RegistrationData>,
	},
	setup(props) {
		const navigation = useNavigation();
		const loading = useLoading();
		const actions = useActions();
		const handlers = createHandlers(
			navigation,
			actions,
			props.feed,
			props.preset,
		);
		return () => renderControls(navigation, loading, handlers);
	},
});

const CompletionPanel = defineComponent({
	name: "CompletionPanel",
	setup() {
		const state = useData();
		return () => renderCompletion(state);
	},
});

const ErrorsPanel = defineComponent({
	name: "ErrorsPanel",
	props: { feed: feedProp },
	setup(props) {
		return () => renderErrors(props.feed);
	},
});

const ProviderShell = defineComponent({
	name: "ProviderShell",
	props: {
		feed: feedProp,
		preset: Object as PropType<RegistrationData>,
	},
	setup(props) {
		const state = useData();
		return () =>
			h("div", { class: "registration" }, [
				h(IndicatorPanel),
				state.isCompleted.value
					? h(CompletionPanel)
					: h("div", [
							h(StepPanel),
							h(ControlsPanel, { feed: props.feed, preset: props.preset }),
						]),
				h(ErrorsPanel, { feed: props.feed }),
			]);
	},
});

export const RegistrationWizardProvider = defineComponent({
	name: "RegistrationWizardProvider",
	props: registrationProps,
	setup(props) {
		const feed = createErrorFeed();
		const raw = rawInputs(props);
		const onError = (error: Error) => {
			props.onError?.(error);
			feed.report(error);
		};
		return () =>
			h(
				Provider,
				{
					definition: raw.definition,
					initialData: raw.initialData,
					plugins: raw.plugins,
					onComplete: props.onComplete,
					onCancel: props.onCancel,
					onStepEnter: props.onStepEnter,
					onError,
				},
				{
					default: () => h(ProviderShell, { feed, preset: raw.preset }),
				},
			);
	},
});

// ─── Page object used by the tests ──────────────────────────────────────────

export type Variant = "direct" | "provider";
export const VARIANTS: Variant[] = ["direct", "provider"];

type ButtonName = "back" | "next" | "reset" | "reset-preset" | "cancel";
type TextField = "name" | "email" | "company";

export class RegistrationPage {
	constructor(readonly wrapper: VueWrapper) {}

	/** Id of the rendered step, or null (e.g. on the completion screen). */
	currentStep(): string | null {
		const section = this.wrapper.find('[data-testid="step"]');
		return section.exists() ? (section.attributes("data-step") ?? null) : null;
	}

	isComplete(): boolean {
		return this.wrapper.find('[data-testid="complete"]').exists();
	}

	completionText(): string {
		return this.wrapper.find('[data-testid="complete"]').text();
	}

	status(stepId: string): string | undefined {
		return this.wrapper
			.find(`li[data-step="${stepId}"]`)
			.attributes("data-status");
	}

	statuses(): Record<string, string | undefined> {
		return Object.fromEntries(STEP_IDS.map((id) => [id, this.status(id)]));
	}

	progress(): number {
		return Number.parseInt(
			this.wrapper.find('[data-testid="progress"]').text(),
			10,
		);
	}

	fieldError(field: keyof RegistrationData & string): string | null {
		const el = this.wrapper.find(`[data-testid="error-${field}"]`);
		return el.exists() ? el.text() : null;
	}

	errorMessages(): string[] {
		return this.wrapper
			.findAll('[data-testid="errors"] li')
			.map((li) => li.text());
	}

	inputValue(field: TextField): string {
		return (
			this.wrapper.find(`[data-testid="input-${field}"]`)
				.element as HTMLInputElement
		).value;
	}

	isChecked(testId: string): boolean {
		return (
			this.wrapper.find(`[data-testid="${testId}"]`).element as HTMLInputElement
		).checked;
	}

	button(name: ButtonName) {
		return this.wrapper.find(`[data-testid="${name}"]`);
	}

	isDisabled(name: ButtonName): boolean {
		return this.button(name).attributes("disabled") !== undefined;
	}

	nextLabel(): string {
		return this.button("next").text();
	}

	async type(field: TextField, value: string): Promise<void> {
		await this.wrapper.find(`[data-testid="input-${field}"]`).setValue(value);
		await flushPromises();
	}

	async chooseAccount(type: "personal" | "business"): Promise<void> {
		await this.wrapper.find(`[data-testid="account-${type}"]`).setValue(true);
		await flushPromises();
	}

	async setAgree(value: boolean): Promise<void> {
		await this.wrapper.find('[data-testid="input-agree"]').setValue(value);
		await flushPromises();
	}

	/** Clicks and lets every non-deferred promise settle. */
	async click(name: ButtonName): Promise<void> {
		await this.button(name).trigger("click");
		await flushPromises();
	}

	async fillPersonal(name = "Ada", email = "ada@example.com"): Promise<void> {
		await this.type("name", name);
		await this.type("email", email);
	}
}

export async function mountRegistration(
	variant: Variant,
	props: RegistrationProps,
): Promise<RegistrationPage> {
	const wrapper =
		variant === "direct"
			? mount(RegistrationWizardDirect, { props })
			: mount(RegistrationWizardProvider, { props });
	// Navigation (isLastStep/canGoNext) is seeded synchronously from the
	// snapshot, but the initial "skipped" refresh for function `enabled` guards
	// (the company step with an unset accountType) lands one microtask after
	// the initial step entry: settle it so tests start from the final state.
	await flushPromises();
	return new RegistrationPage(wrapper as unknown as VueWrapper);
}
