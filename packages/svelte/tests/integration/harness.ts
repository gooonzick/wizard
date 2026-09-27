import type {
	PersistedWizardSnapshot,
	WizardPersistenceAdapter,
} from "@gooonzick/wizard-core";
import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { expect } from "vitest";
import type { RegistrationData } from "./registration";

export interface Deferred<T = void> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

type Snapshot = PersistedWizardSnapshot<RegistrationData>;

export interface MemoryAdapter
	extends WizardPersistenceAdapter<RegistrationData> {
	/** The stored record (a JSON round-tripped copy), or null. */
	record: Snapshot | null;
	/** When set, `load()` returns this deferred's promise instead of the record. */
	pendingLoad: Deferred<Snapshot | null> | null;
	saves: number;
	clears: number;
}

/** In-memory persistence adapter; sync by default, async via `pendingLoad`. */
export function createMemoryAdapter(): MemoryAdapter {
	const adapter: MemoryAdapter = {
		record: null,
		pendingLoad: null,
		saves: 0,
		clears: 0,
		load() {
			if (adapter.pendingLoad) {
				return adapter.pendingLoad.promise;
			}
			return adapter.record;
		},
		save(snapshot) {
			adapter.saves += 1;
			adapter.record = JSON.parse(JSON.stringify(snapshot)) as Snapshot;
		},
		clear() {
			adapter.clears += 1;
			adapter.record = null;
		},
	};
	return adapter;
}

// ---- DOM helpers (user-level interactions) ----

export const currentStep = (): string | null =>
	screen.getByTestId("current-step").textContent;

export async function expectStep(stepId: string): Promise<void> {
	await waitFor(() => expect(currentStep()).toBe(stepId));
}

export const stepStatus = (stepId: string): string | null =>
	screen.getByTestId(`step-${stepId}`).getAttribute("data-status");

export const progressText = (): string | null =>
	screen.getByTestId("progress").textContent;

export const progressValue = (): number =>
	Number.parseInt(progressText() ?? "", 10);

export const button = (name: string): HTMLButtonElement =>
	screen.getByRole("button", { name }) as HTMLButtonElement;

export const input = (label: string): HTMLInputElement =>
	screen.getByLabelText(label) as HTMLInputElement;

export const select = (label: string): HTMLSelectElement =>
	screen.getByLabelText(label) as HTMLSelectElement;

export const errorArea = (): string | null =>
	screen.queryByTestId("error-area")?.textContent ?? null;

export async function type(label: string, value: string): Promise<void> {
	await fireEvent.input(input(label), { target: { value } });
}

export async function choose(label: string, value: string): Promise<void> {
	await fireEvent.change(select(label), { target: { value } });
}

export async function click(name: string): Promise<void> {
	await fireEvent.click(button(name));
}

export async function fillPersonal(
	name = "Ada Lovelace",
	email = "ada@example.com",
): Promise<void> {
	await type("Name", name);
	await type("Email", email);
}

/** personal -> account, with valid personal details. */
export async function reachAccount(): Promise<void> {
	await expectStep("personal");
	await fillPersonal();
	await click("Next");
	await expectStep("account");
}

/** personal -> account -> company (business branch). */
export async function reachCompany(): Promise<void> {
	await reachAccount();
	await choose("Account type", "business");
	await click("Next");
	await expectStep("company");
}

/** personal -> account -> review (personal branch). */
export async function reachReviewPersonal(): Promise<void> {
	await reachAccount();
	await choose("Account type", "personal");
	await click("Next");
	await expectStep("review");
}

export async function check(label: string): Promise<void> {
	await fireEvent.click(input(label));
}
