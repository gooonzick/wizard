import { createLinearWizard } from "@gooonzick/wizard-core";
import type { WizardStateManager } from "@gooonzick/wizard-state";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import type { UseWizardReturn } from "../src/types";
import { useWizard } from "../src/use-wizard";

type D = { name: string };

// Capture the manager useWizard builds so tests can assert that the binding's
// loading slice and the shared manager agree (the manager is not public API).
const captured = vi.hoisted(() => ({
	managers: [] as unknown[],
}));

vi.mock("@gooonzick/wizard-state", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@gooonzick/wizard-state")>();
	return {
		...actual,
		createMachineAndManager: ((options) => {
			const result = actual.createMachineAndManager(options);
			captured.managers.push(result.manager);
			return result;
		}) as typeof actual.createMachineAndManager,
	};
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function mountWizard(options: Parameters<typeof useWizard<D>>[0]): {
	wizard: UseWizardReturn<D>;
	manager: WizardStateManager<D>;
} {
	let wizard!: UseWizardReturn<D>;
	mount(
		defineComponent({
			setup() {
				wizard = useWizard<D>(options);
				return () => null;
			},
		}),
	);
	const manager = captured.managers.at(-1) as WizardStateManager<D>;
	return { wizard, manager };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useWizard on the shared state helpers", () => {
	it("a busy-rejected second goNext does not clear isNavigating of the first", async () => {
		const gate = deferred();
		let gated = false;
		const definition = createLinearWizard<D>({
			id: "double-next",
			steps: [
				{
					id: "step1",
					title: "Step 1",
					validate: async () => {
						if (gated) await gate.promise;
						return { valid: true };
					},
				},
				{ id: "step2", title: "Step 2" },
			],
		});
		const { wizard, manager } = mountWizard({
			definition,
			initialData: { name: "" },
		});
		await flush();
		gated = true;

		const first = wizard.navigation.goNext();
		const second = wizard.navigation.goNext();
		// The second call is rejected (busy) while the first is still in flight.
		await second.catch(() => {});
		await nextTick();

		expect(wizard.loading.isNavigating.value).toBe(true);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(true);
		expect(wizard.state.currentStepId.value).toBe("step1");

		gate.resolve();
		await first;
		await nextTick();

		expect(wizard.state.currentStepId.value).toBe("step2");
		expect(wizard.loading.isNavigating.value).toBe(false);
		expect(manager.getLoadingSnapshot().isNavigating).toBe(false);
	});

	it("reflects validate/submit loading in manager.getLoadingSnapshot()", async () => {
		const gate = deferred();
		let gated = false;
		const definition = createLinearWizard<D>({
			id: "loading-mirror",
			steps: [
				{
					id: "step1",
					title: "Step 1",
					validate: async () => {
						if (gated) await gate.promise;
						return { valid: true };
					},
				},
			],
		});
		const { wizard, manager } = mountWizard({
			definition,
			initialData: { name: "" },
		});
		await flush();
		gated = true;

		const validating = wizard.actions.validate();
		expect(manager.getLoadingSnapshot().isValidating).toBe(true);
		expect(wizard.loading.isValidating.value).toBe(true);

		gate.resolve();
		await validating;
		expect(manager.getLoadingSnapshot().isValidating).toBe(false);
		expect(wizard.loading.isValidating.value).toBe(false);

		const submitting = wizard.actions.submit();
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(true);
		expect(wizard.loading.isSubmitting.value).toBe(true);
		await submitting;
		expect(manager.getLoadingSnapshot().isSubmitting).toBe(false);
		expect(wizard.loading.isSubmitting.value).toBe(false);
	});

	it("reset(X) then reset() restores X (sticky reset baseline)", async () => {
		const definition = createLinearWizard<D>({
			id: "sticky-reset",
			steps: [
				{ id: "step1", title: "Step 1" },
				{ id: "step2", title: "Step 2" },
			],
		});
		const { wizard } = mountWizard({
			definition,
			initialData: { name: "initial" },
		});

		wizard.actions.reset({ name: "X" });
		expect(wizard.state.data.value.name).toBe("X");

		wizard.actions.updateField("name", "Y");
		await wizard.navigation.goNext();
		expect(wizard.state.currentStepId.value).toBe("step2");

		wizard.actions.reset();
		expect(wizard.state.currentStepId.value).toBe("step1");
		expect(wizard.state.data.value.name).toBe("X");
	});

	it("updates reactive state after the async validate that follows restore()", async () => {
		const definition = createLinearWizard<D>({
			id: "restore-revalidate",
			steps: [
				{
					id: "step1",
					title: "Step 1",
					validate: async (data) => {
						await new Promise((r) => setTimeout(r, 5));
						return data.name
							? { valid: true }
							: { valid: false, errors: { name: "required" } };
					},
				},
				{ id: "step2", title: "Step 2" },
			],
		});
		const { wizard } = mountWizard({
			definition,
			initialData: { name: "ok" },
		});
		await new Promise((r) => setTimeout(r, 20));
		expect(wizard.validation.isValid.value).toBe(true);

		// A snapshot that claims isValid:true on data that is actually invalid.
		const serialized = {
			...wizard.actions.serialize(),
			data: { name: "" },
			isValid: true,
			validationErrors: undefined,
		};
		wizard.actions.restore(serialized);

		// Synchronous restore emission.
		expect(wizard.state.data.value.name).toBe("");
		expect(wizard.validation.isValid.value).toBe(true);

		// The machine's fire-and-forget re-validate emits onStateChange later.
		await new Promise((r) => setTimeout(r, 20));
		expect(wizard.validation.isValid.value).toBe(false);
		expect(wizard.validation.validationErrors.value).toEqual({
			name: "required",
		});
	});
});
