import {
	createLinearWizard,
	createWizard,
	type WizardData,
	type WizardDefinition,
	WizardMachine,
	type WizardState,
} from "@gooonzick/wizard-core";
import { describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

/**
 * Replicates the binding wiring (react/wizard-provider.tsx:110-157): the
 * machine's onStateChange forwards (newState, previousState) into
 * manager.handleStateChange so the manager's caches update exactly as they do
 * in production. Because the machine constructor needs onStateChange (which
 * references the manager) and the manager needs the machine, a forward
 * reference is used.
 */
function createWiredManager<T extends WizardData>(
	definition: WizardDefinition<T>,
	initialData: T,
) {
	let manager: WizardStateManager<T>;
	let previous: WizardState<T> | undefined;
	const machine = new WizardMachine<T>(definition, {}, initialData, {
		onStateChange: (newState) => {
			const old = previous;
			previous = newState;
			if (old) manager.handleStateChange(newState, old);
		},
	});
	previous = machine.snapshot;
	manager = new WizardStateManager<T>(machine, definition.initialStepId);
	return { machine, manager };
}

// Deterministic-enough settle for the async nav recompute (mirrors the vue
// internal manager test style: real timers, no fake timers).
const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// Standard 2-step linear wizard used by the non-guarded suites.
function buildLinear() {
	const definition = createLinearWizard<{ name: string }>({
		id: "test",
		steps: [{ id: "step1" }, { id: "step2" }],
	});
	return createWiredManager<{ name: string }>(definition, { name: "" });
}

describe("WizardStateManager", () => {
	describe("initialization", () => {
		it("should initialize with machine and initial step ID", () => {
			const { machine, manager } = buildLinear();

			expect(manager.getStateSnapshot().currentStepId).toBe("step1");
			expect(manager.getSnapshot()).toEqual(machine.snapshot);
			expect(manager.getInitialStepId()).toBe("step1");
		});

		it("should initialize caches with machine state", () => {
			const { manager } = buildLinear();

			const stateSnapshot = manager.getStateSnapshot();
			expect(stateSnapshot.currentStepId).toBe("step1");
			expect(stateSnapshot.isCompleted).toBe(false);

			const validationSnapshot = manager.getValidationSnapshot();
			expect(validationSnapshot.isValid).toBe(true);

			const loadingSnapshot = manager.getLoadingSnapshot();
			expect(loadingSnapshot.isValidating).toBe(false);
			expect(loadingSnapshot.isSubmitting).toBe(false);
			expect(loadingSnapshot.isNavigating).toBe(false);
		});

		it("should expose navigation safe defaults before the async recompute settles", () => {
			const { manager } = buildLinear();

			// Synchronously after construction, the async recompute has not run yet.
			const navSnapshot = manager.getNavigationSnapshot();
			expect(navSnapshot.canGoNext).toBe(false);
			expect(navSnapshot.canGoPrevious).toBe(false);
			expect(navSnapshot.availableSteps).toEqual([]);
			expect(navSnapshot.isFirstStep).toBe(true);
			expect(navSnapshot.isLastStep).toBe(true);
		});

		it("should recompute real navigation values after settle", async () => {
			const { manager } = buildLinear();
			await settle();

			const navSnapshot = manager.getNavigationSnapshot();
			expect(navSnapshot.canGoNext).toBe(true);
			expect(navSnapshot.canGoPrevious).toBe(false);
			expect(navSnapshot.availableSteps).toEqual(["step1", "step2"]);
			expect(navSnapshot.isFirstStep).toBe(true);
			expect(navSnapshot.isLastStep).toBe(false);
		});
	});

	describe("subscriptions", () => {
		it("should not invoke a fresh subscriber before any change", () => {
			const { manager } = buildLinear();
			const listener = vi.fn();

			manager.subscribe(listener);
			expect(listener).not.toHaveBeenCalled();
		});

		it("should subscribe to a specific channel", () => {
			const { manager } = buildLinear();
			const listener = vi.fn();

			manager.subscribe(listener, "state");
			expect(listener).not.toHaveBeenCalled();
		});

		it("should unsubscribe listener (no notify after a real machine change)", () => {
			const { machine, manager } = buildLinear();
			const listener = vi.fn();

			const unsubscribe = manager.subscribe(listener);
			unsubscribe();

			machine.updateData((d) => ({ ...d, name: "changed" }));
			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe("notifications", () => {
		it("should notify subscribers when a real data change occurs", () => {
			const { machine, manager } = buildLinear();
			const listener = vi.fn();

			manager.subscribe(listener);
			machine.updateData((d) => ({ ...d, name: "new" }));

			expect(listener).toHaveBeenCalled();
		});

		it("should route a data change to state, navigation, and validation channels", () => {
			const { machine, manager } = buildLinear();
			const stateListener = vi.fn();
			const navListener = vi.fn();
			const validationListener = vi.fn();

			manager.subscribe(stateListener, "state");
			manager.subscribe(navListener, "navigation");
			manager.subscribe(validationListener, "validation");

			machine.updateData((d) => ({ ...d, name: "new" }));

			expect(stateListener).toHaveBeenCalled();
			expect(navListener).toHaveBeenCalled();
			expect(validationListener).toHaveBeenCalled();
		});

		it("should always notify 'all' channel subscribers on a real change", () => {
			const { machine, manager } = buildLinear();
			const allListener = vi.fn();
			const stateListener = vi.fn();

			manager.subscribe(allListener, "all");
			manager.subscribe(stateListener, "state");

			machine.updateData((d) => ({ ...d, name: "new" }));

			expect(allListener).toHaveBeenCalled();
			expect(stateListener).toHaveBeenCalled();
		});

		// Pure subscription-mechanics: channel filtering and dedup cannot be
		// isolated through a real machine action (updateData always affects
		// state + navigation + validation together), so drive notifySubscribers
		// directly here.
		it("should notify only the affected channels", () => {
			const { manager } = buildLinear();
			const stateListener = vi.fn();
			const navListener = vi.fn();
			const validationListener = vi.fn();

			manager.subscribe(stateListener, "state");
			manager.subscribe(navListener, "navigation");
			manager.subscribe(validationListener, "validation");

			manager.notifySubscribers(["state", "validation"]);

			expect(stateListener).toHaveBeenCalled();
			expect(navListener).not.toHaveBeenCalled();
			expect(validationListener).toHaveBeenCalled();
		});

		it("should deduplicate channels when notifying", () => {
			const { manager } = buildLinear();
			const listener = vi.fn();

			manager.subscribe(listener, "state");
			manager.notifySubscribers(["state", "state", "state"]);

			expect(listener).toHaveBeenCalledOnce();
		});
	});

	describe("cache reference stability", () => {
		it("should return a stable state snapshot reference", () => {
			const { manager } = buildLinear();
			expect(manager.getStateSnapshot()).toBe(manager.getStateSnapshot());
		});

		it("should return a stable validation snapshot reference", () => {
			const { manager } = buildLinear();
			expect(manager.getValidationSnapshot()).toBe(
				manager.getValidationSnapshot(),
			);
		});

		it("should return a stable navigation snapshot reference", () => {
			const { manager } = buildLinear();
			expect(manager.getNavigationSnapshot()).toBe(
				manager.getNavigationSnapshot(),
			);
		});

		it("should return a stable loading snapshot reference", () => {
			const { manager } = buildLinear();
			expect(manager.getLoadingSnapshot()).toBe(manager.getLoadingSnapshot());
		});

		it("should keep the navigation reference stable across repeated recomputes", async () => {
			const { manager } = buildLinear();
			await settle();
			const nav1 = manager.getNavigationSnapshot();
			await settle();
			// No intervening change: the recompute must not rewrite the cache.
			expect(manager.getNavigationSnapshot()).toBe(nav1);
		});
	});

	describe("loading", () => {
		it("should update loading state and notify the loading channel", () => {
			const { manager } = buildLinear();
			const listener = vi.fn();

			manager.subscribe(listener, "loading");
			manager.setLoadingState({ isValidating: true });

			expect(manager.getLoadingSnapshot().isValidating).toBe(true);
			expect(listener).toHaveBeenCalled();
		});
	});

	describe("machine access", () => {
		it("should return the machine", () => {
			const { machine, manager } = buildLinear();
			expect(manager.getMachine()).toBe(machine);
		});

		it("should return the current step definition", () => {
			const { manager } = buildLinear();
			expect(manager.getCurrentStep().id).toBe("step1");
		});

		it("should reflect visited steps and history after navigation", async () => {
			const { machine, manager } = buildLinear();
			expect(manager.getVisitedSteps()).toEqual(["step1"]);
			expect(manager.getStepHistory()).toEqual(["step1"]);

			await machine.goNext();

			expect(manager.getVisitedSteps()).toEqual(["step1", "step2"]);
			expect(manager.getStepHistory()).toEqual(["step1", "step2"]);
		});
	});

	describe("isFirstStep calculation", () => {
		it("should mark the initial step as first", () => {
			const { manager } = buildLinear();
			expect(manager.getNavigationSnapshot().isFirstStep).toBe(true);
		});

		it("should not mark a later step as first after navigation", async () => {
			const { machine, manager } = buildLinear();
			await machine.goNext();
			await settle();
			expect(manager.getNavigationSnapshot().isFirstStep).toBe(false);
		});
	});

	// --- M1 (P1-6): availableSteps-only changes must be committed ----------
	describe("navigation recompute — availableSteps change detection (M1)", () => {
		interface M1Data extends Record<string, unknown> {
			showExtra: boolean;
		}

		function buildM1() {
			const definition = createWizard<M1Data>("m1")
				.initialStep("step1")
				.step("step1", (b) => b.next("step2"))
				.step("step2", (b) => b.previous("step1"))
				// 'extra' is enabled purely by data; it is NOT step1.next, so
				// toggling it changes availableSteps WITHOUT changing
				// canGoNext/canGoPrevious/isLastStep.
				.step("extra", (b) => b.enabled((d: M1Data) => d.showExtra === true))
				.build();
			return createWiredManager<M1Data>(definition, { showExtra: true });
		}

		it("commits availableSteps changes even when nav booleans are unchanged (M1)", async () => {
			const { machine, manager } = buildM1();
			await settle();
			expect(manager.getNavigationSnapshot().availableSteps).toEqual([
				"step1",
				"step2",
				"extra",
			]);
			const before = manager.getNavigationSnapshot();
			expect(before.canGoNext).toBe(true);
			expect(before.canGoPrevious).toBe(false);
			expect(before.isLastStep).toBe(false);

			// Flip only the guard for 'extra' — nav booleans stay identical.
			machine.updateData((d) => ({ ...d, showExtra: false }));
			await settle();

			const after = manager.getNavigationSnapshot();
			expect(after.availableSteps).toEqual(["step1", "step2"]);
			expect(after.canGoNext).toBe(true);
			expect(after.canGoPrevious).toBe(false);
			expect(after.isLastStep).toBe(false);
		});
	});

	// --- M2 (P1-7): coalesced recompute must run a trailing pass -----------
	describe("navigation recompute — trailing recompute after coalescing (M2)", () => {
		interface M2Data extends Record<string, unknown> {
			goNext: boolean;
		}

		function buildM2() {
			const definition = createWizard<M2Data>("m2")
				.initialStep("step1")
				// step1.next is conditional on data.goNext: guard false =>
				// resolveTransition returns null => canGoNext false. Guard true =>
				// step2 => canGoNext true.
				.step("step1", (b) =>
					b.nextWhen([{ when: (d: M2Data) => d.goNext === true, to: "step2" }]),
				)
				.step("step2", (b) => b.previous("step1"))
				.build();
			return createWiredManager<M2Data>(definition, { goNext: false });
		}

		it("recomputes navigation for the last edit after coalesced requests (M2)", async () => {
			const { machine, manager } = buildM2();
			await settle();
			expect(manager.getNavigationSnapshot().canGoNext).toBe(false);

			// Two synchronous edits: first flips canGoNext->true, second flips it
			// back->false. The first starts a compute; the second is coalesced.
			machine.updateData((d) => ({ ...d, goNext: true }));
			machine.updateData((d) => ({ ...d, goNext: false }));
			await settle();

			// Final state must reflect the LAST edit (goNext:false => false).
			expect(manager.getNavigationSnapshot().canGoNext).toBe(false);
		});
	});
});
