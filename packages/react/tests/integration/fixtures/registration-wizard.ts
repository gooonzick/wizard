import {
	createWizard,
	type PersistedWizardSnapshot,
	type StepGuard,
	type WizardDefinition,
	type WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";

/**
 * Shared registration-wizard fixture. The same shape is used by the Vue /
 * Svelte / Solid integration suites so behavior is comparable across bindings.
 */
export interface RegistrationData extends Record<string, unknown> {
	name: string;
	email: string;
	accountType: "personal" | "business" | "";
	company: string;
	agree: boolean;
}

export const STEP_IDS = ["personal", "account", "company", "review"] as const;
export type RegistrationStepId = (typeof STEP_IDS)[number];

export const STEP_TITLES: Record<RegistrationStepId, string> = {
	personal: "Personal details",
	account: "Account type",
	company: "Company",
	review: "Review",
};

export const initialRegistrationData: RegistrationData = {
	name: "",
	email: "",
	accountType: "",
	company: "",
	agree: false,
};

export const isBusiness = (d: RegistrationData): boolean =>
	d.accountType === "business";

export interface RegistrationWizardOptions {
	/** `company` step onSubmit (deferred-controlled in tests). */
	companySubmit?: (data: RegistrationData) => Promise<void>;
	/** `definition.onComplete`. */
	onComplete?: (data: RegistrationData) => void | Promise<void>;
	/** `definition.onCancel`. */
	onCancel?: (data: RegistrationData) => void | Promise<void>;
	/** Override for the `company` step's enabled guard. */
	companyEnabled?: StepGuard<RegistrationData>;
}

/**
 * personal -> account -> (business ? company : review) -> review.
 * `company` is guarded by `enabled: accountType === "business"`.
 */
export function createRegistrationWizard(
	options: RegistrationWizardOptions = {},
): WizardDefinition<RegistrationData> {
	const builder = createWizard<RegistrationData>("registration")
		.initialStep("personal")
		.step("personal", (s) =>
			s
				.title(STEP_TITLES.personal)
				.validate(async (d) => {
					// Genuinely async: resolves on a later microtask.
					await Promise.resolve();
					const errors: Record<string, string> = {};
					if (!d.name.trim()) errors.name = "Name is required";
					if (!d.email.trim()) errors.email = "Email is required";
					else if (!d.email.includes("@"))
						errors.email = "Email must contain @";
					return Object.keys(errors).length > 0
						? { valid: false, errors }
						: { valid: true };
				})
				.next("account"),
		)
		.step("account", (s) =>
			s
				.title(STEP_TITLES.account)
				.validate((d) =>
					d.accountType
						? { valid: true }
						: {
								valid: false,
								errors: { accountType: "Account type is required" },
							},
				)
				.previous("personal")
				// "personal (or not yet chosen) -> review": an explicit catch-all keeps
				// the step non-terminal while accountType is still empty.
				.nextWhen([
					{ when: isBusiness, to: "company" },
					{ when: (d) => d.accountType !== "business", to: "review" },
				]),
		)
		.step("company", (s) => {
			s.title(STEP_TITLES.company)
				.enabled(options.companyEnabled ?? isBusiness)
				.validate((d) =>
					d.company.trim()
						? { valid: true }
						: { valid: false, errors: { company: "Company is required" } },
				)
				.previous("account")
				.next("review");
			if (options.companySubmit) {
				const submit = options.companySubmit;
				s.onSubmit((d) => submit(d));
			}
		})
		.step("review", (s) =>
			s
				.title(STEP_TITLES.review)
				.validate((d) =>
					d.agree
						? { valid: true }
						: { valid: false, errors: { agree: "You must accept the terms" } },
				),
		);
	if (options.onComplete) {
		const onComplete = options.onComplete;
		builder.onComplete((d) => onComplete(d));
	}
	if (options.onCancel) {
		const onCancel = options.onCancel;
		builder.onCancel((d) => onCancel(d));
	}
	return builder.build();
}

export interface Deferred<T = void> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

/** Manually-settled promise: async work in tests is driven explicitly. */
export function createDeferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export interface MemoryAdapter
	extends WizardPersistenceAdapter<RegistrationData> {
	/** Currently stored record (deep copy of the last save), or null. */
	stored(): PersistedWizardSnapshot<RegistrationData> | null;
	loads: number;
	saves: number;
	clears: number;
}

/**
 * In-memory persistence adapter. `sync` returns the stored record directly
 * from load() (restore happens inside the machine constructor); `async`
 * resolves it on a later microtask.
 */
export function createMemoryAdapter(mode: "sync" | "async"): MemoryAdapter {
	let record: PersistedWizardSnapshot<RegistrationData> | null = null;
	const adapter: MemoryAdapter = {
		loads: 0,
		saves: 0,
		clears: 0,
		stored: () => record,
		load() {
			adapter.loads += 1;
			const value = record ? structuredClone(record) : null;
			return mode === "sync" ? value : Promise.resolve(value);
		},
		save(snapshot) {
			adapter.saves += 1;
			record = structuredClone(snapshot);
		},
		clear() {
			adapter.clears += 1;
			record = null;
		},
	};
	return adapter;
}
