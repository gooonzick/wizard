import {
	createLinearWizard,
	type ValidationResult,
	type WizardDefinition,
	WizardNavigationError,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import { flush } from "./helpers/flush";
import { initialData, type SignupData } from "./helpers/wizard";

interface Deferred<R> {
	promise: Promise<R>;
	resolve: (value: R) => void;
}

function deferred<R>(): Deferred<R> {
	let resolve!: (value: R) => void;
	const promise = new Promise<R>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

/**
 * A 2-step wizard whose first step's validator parks on a fresh deferred per
 * invocation, so each overlapping operation can be settled independently.
 */
function createControlledWizard() {
	const pending: Deferred<ValidationResult>[] = [];
	const definition: WizardDefinition<SignupData> =
		createLinearWizard<SignupData>({
			id: "loading-flags",
			steps: [
				{
					id: "personal",
					title: "Personal",
					validate: () => {
						const d = deferred<ValidationResult>();
						pending.push(d);
						return d.promise;
					},
				},
				{ id: "plan", title: "Plan" },
			],
		});
	const wizard = createWizard<SignupData>({ definition, initialData });
	return { wizard, pending };
}

describe("loading flags (reference-counted)", () => {
	it("L1: a double-clicked goNext rejected as busy does not clear isNavigating", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const first = wizard.goNext();
		await vi.waitFor(() => expect(pending).toHaveLength(1));
		expect(wizard.isNavigating).toBe(true);

		const second = wizard.goNext();
		const error = await second.then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(WizardNavigationError);
		expect((error as WizardNavigationError).reason).toBe("busy");

		// The first transition is still in flight.
		expect(wizard.isNavigating).toBe(true);

		pending[0].resolve({ valid: true });
		await first;

		expect(wizard.isNavigating).toBe(false);
		expect(wizard.currentStepId).toBe("plan");
	});

	it("L2: overlapping validate() and validateAll() keep isValidating until both settle", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const single = wizard.actions.validate();
		const all = wizard.actions.validateAll();
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		expect(wizard.isValidating).toBe(true);

		// Settle validate() first: validateAll() is still running.
		pending[0].resolve({ valid: true });
		await single;
		expect(wizard.isValidating).toBe(true);

		pending[1].resolve({ valid: true });
		const summary = await all;
		expect(summary.valid).toBe(true);
		expect(wizard.isValidating).toBe(false);
	});

	it("L2b: the reverse settle order also keeps isValidating until both settle", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const single = wizard.actions.validate();
		const all = wizard.actions.validateAll();
		await vi.waitFor(() => expect(pending).toHaveLength(2));

		pending[1].resolve({ valid: true });
		await all;
		expect(wizard.isValidating).toBe(true);

		pending[0].resolve({ valid: true });
		await single;
		expect(wizard.isValidating).toBe(false);
	});

	it("L3: cancel() mid-goNext forces isNavigating off; the superseded goNext cannot flip it back", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const first = wizard.goNext();
		await vi.waitFor(() => expect(pending).toHaveLength(1));
		expect(wizard.isNavigating).toBe(true);

		// cancel() supersedes the in-flight transition and resets the wizard, so
		// the loading flags are forced off as soon as it resolves.
		await wizard.actions.cancel();
		expect(wizard.isNavigating).toBe(false);
		expect(wizard.currentStepId).toBe("personal");

		// The superseded goNext settles later; its cleanup must not go negative
		// or leave the flag stuck.
		pending[0].resolve({ valid: true });
		await Promise.allSettled([first]);
		expect(wizard.isNavigating).toBe(false);

		// A fresh navigation still toggles the flag normally.
		const next = wizard.goNext();
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		expect(wizard.isNavigating).toBe(true);
		pending[1].resolve({ valid: true });
		await next;
		expect(wizard.isNavigating).toBe(false);
	});

	it("L4: a validate() started after cancel() keeps isValidating while a stale pre-cancel validate() settles", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const stale = wizard.actions.validate();
		await vi.waitFor(() => expect(pending).toHaveLength(1));
		expect(wizard.isValidating).toBe(true);

		await wizard.actions.cancel();
		expect(wizard.isValidating).toBe(false);

		const fresh = wizard.actions.validate();
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		expect(wizard.isValidating).toBe(true);

		// The stale (pre-cancel) validate settles: it must not steal the fresh
		// validate's reference.
		pending[0].resolve({ valid: true });
		await stale;
		expect(wizard.isValidating).toBe(true);

		pending[1].resolve({ valid: true });
		await fresh;
		expect(wizard.isValidating).toBe(false);
	});

	it("L5: overlapping submit() rejected as busy does not clear isSubmitting", async () => {
		const { wizard, pending } = createControlledWizard();
		await flush();

		const first = wizard.actions.submit();
		await vi.waitFor(() => expect(pending).toHaveLength(1));
		expect(wizard.isSubmitting).toBe(true);

		await expect(wizard.actions.submit()).rejects.toBeInstanceOf(
			WizardNavigationError,
		);
		expect(wizard.isSubmitting).toBe(true);

		pending[0].resolve({ valid: true });
		await first;
		expect(wizard.isSubmitting).toBe(false);
	});
});
