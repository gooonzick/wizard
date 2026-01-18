import type { WizardData, WizardMachine, WizardState } from "@gooonzick/wizard-core";
import { describe, expect, test, vi } from "vitest";
import { WizardStateManager } from "../src/manager";

/**
 * Mock WizardMachine for testing
 */
function createMockMachine<T extends WizardData>(): WizardMachine<T> {
	return {
		snapshot: {
			currentStepId: "step-1",
			data: {} as T,
			isCompleted: false,
			isValid: true,
			validationErrors: undefined,
		},
		currentStep: {
			id: "step-1",
		} as any,
		visited: ["step-1"],
		history: ["step-1"],
		getNextStepId: vi.fn().mockResolvedValue("step-2"),
		getPreviousStepId: vi.fn().mockResolvedValue(null),
		getAvailableSteps: vi.fn().mockResolvedValue(["step-1", "step-2"]),
	} as any;
}

describe("WizardStateManager", () => {
	describe("initialization", () => {
		test("should initialize with machine and initial step ID", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			expect(manager.getSnapshot()).toBe(machine.snapshot);
			expect(manager.getInitialStepId()).toBe("step-1");
		});

		test("should initialize caches with machine state", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const stateSnapshot = manager.getStateSnapshot();
			expect(stateSnapshot.currentStepId).toBe("step-1");
			expect(stateSnapshot.isCompleted).toBe(false);

			const validationSnapshot = manager.getValidationSnapshot();
			expect(validationSnapshot.isValid).toBe(true);

			const loadingSnapshot = manager.getLoadingSnapshot();
			expect(loadingSnapshot.isValidating).toBe(false);
			expect(loadingSnapshot.isSubmitting).toBe(false);
			expect(loadingSnapshot.isNavigating).toBe(false);
		});

		test("should initialize navigation cache with safe defaults", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const navSnapshot = manager.getNavigationSnapshot();
			expect(navSnapshot.canGoNext).toBe(false);
			expect(navSnapshot.canGoPrevious).toBe(false);
			expect(navSnapshot.availableSteps).toEqual([]);
			expect(navSnapshot.isFirstStep).toBe(true);
			expect(navSnapshot.isLastStep).toBe(true);
		});
	});

	describe("subscriptions", () => {
		test("should subscribe to all channels by default", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener);
			expect(listener).not.toHaveBeenCalled();
		});

		test("should subscribe to specific channel", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener, "state");
			expect(listener).not.toHaveBeenCalled();
		});

		test("should unsubscribe listener", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			const unsubscribe = manager.subscribe(listener);
			unsubscribe();

			manager.notifySubscribers(["state"]);
			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe("notifications", () => {
		test("should notify all subscribers when state changes", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener);
			manager.notifySubscribers(["state"]);

			expect(listener).toHaveBeenCalled();
		});

		test("should notify all subscribers for affected channels", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
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

		test("should always notify 'all' channel subscribers", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const allListener = vi.fn();
			const stateListener = vi.fn();

			manager.subscribe(allListener, "all");
			manager.subscribe(stateListener, "state");

			manager.notifySubscribers(["state"]);

			expect(allListener).toHaveBeenCalled();
			expect(stateListener).toHaveBeenCalled();
		});

		test("should deduplicate channels when notifying", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener, "state");

			manager.notifySubscribers(["state", "state", "state"]);

			expect(listener).toHaveBeenCalledOnce();
		});
	});

	describe("state snapshots", () => {
		test("should return cached state snapshot", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const snap1 = manager.getStateSnapshot();
			const snap2 = manager.getStateSnapshot();

			expect(snap1).toBe(snap2);
		});

		test("should return cached validation snapshot", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const snap1 = manager.getValidationSnapshot();
			const snap2 = manager.getValidationSnapshot();

			expect(snap1).toBe(snap2);
		});

		test("should return cached navigation snapshot", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const snap1 = manager.getNavigationSnapshot();
			const snap2 = manager.getNavigationSnapshot();

			expect(snap1).toBe(snap2);
		});

		test("should return cached loading snapshot", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const snap1 = manager.getLoadingSnapshot();
			const snap2 = manager.getLoadingSnapshot();

			expect(snap1).toBe(snap2);
		});

		test("should update loading state and notify", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener, "loading");

			manager.setLoadingState({ isValidating: true });

			const snap = manager.getLoadingSnapshot();
			expect(snap.isValidating).toBe(true);
			expect(listener).toHaveBeenCalled();
		});
	});

	describe("state change handling", () => {
		test("should handle data change affecting state, navigation, and validation", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener);

			const oldState: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "old" },
				isCompleted: false,
				isValid: true,
			};

			const newState: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "new" },
				isCompleted: false,
				isValid: true,
			};

			manager.handleStateChange(newState, oldState);

			expect(listener).toHaveBeenCalled();
		});

		test("should handle step change affecting state and navigation", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener);

			const oldState: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "test" },
				isCompleted: false,
				isValid: true,
			};

			const newState: WizardState<{ name: string }> = {
				currentStepId: "step-2",
				data: { name: "test" },
				isCompleted: false,
				isValid: true,
			};

			manager.handleStateChange(newState, oldState);

			expect(listener).toHaveBeenCalled();
		});

		test("should handle validation change", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener, "validation");

			const oldState: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "test" },
				isCompleted: false,
				isValid: true,
			};

			const newState: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "test" },
				isCompleted: false,
				isValid: false,
				validationErrors: { name: "Required" },
			};

			manager.handleStateChange(newState, oldState);

			expect(listener).toHaveBeenCalled();
		});

		test("should not notify if no state changes", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener = vi.fn();

			manager.subscribe(listener);

			const state: WizardState<{ name: string }> = {
				currentStepId: "step-1",
				data: { name: "test" },
				isCompleted: false,
				isValid: true,
			};

			manager.handleStateChange(state, state);

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe("machine access", () => {
		test("should return machine", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			expect(manager.getMachine()).toBe(machine);
		});

		test("should return visited steps", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			expect(manager.getVisitedSteps()).toEqual(["step-1"]);
		});

		test("should return step history", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			expect(manager.getStepHistory()).toEqual(["step-1"]);
		});

		test("should return current step", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const step = manager.getCurrentStep();
			expect(step.id).toBe("step-1");
		});
	});

	describe("channel-specific subscriptions", () => {
		test("should notify only state channel", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const stateListener = vi.fn();
			const navListener = vi.fn();

			manager.subscribe(stateListener, "state");
			manager.subscribe(navListener, "navigation");

			manager.notifySubscribers(["state"]);

			expect(stateListener).toHaveBeenCalledOnce();
			expect(navListener).not.toHaveBeenCalled();
		});

		test("should notify only validation channel", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const validationListener = vi.fn();
			const loadingListener = vi.fn();

			manager.subscribe(validationListener, "validation");
			manager.subscribe(loadingListener, "loading");

			manager.notifySubscribers(["validation"]);

			expect(validationListener).toHaveBeenCalledOnce();
			expect(loadingListener).not.toHaveBeenCalled();
		});

		test("should notify only loading channel", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const loadingListener = vi.fn();
			const stateListener = vi.fn();

			manager.subscribe(loadingListener, "loading");
			manager.subscribe(stateListener, "state");

			manager.notifySubscribers(["loading"]);

			expect(loadingListener).toHaveBeenCalledOnce();
			expect(stateListener).not.toHaveBeenCalled();
		});
	});

	describe("multiple subscriptions", () => {
		test("should support multiple listeners on same channel", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener1 = vi.fn();
			const listener2 = vi.fn();
			const listener3 = vi.fn();

			manager.subscribe(listener1, "state");
			manager.subscribe(listener2, "state");
			manager.subscribe(listener3, "state");

			manager.notifySubscribers(["state"]);

			expect(listener1).toHaveBeenCalledOnce();
			expect(listener2).toHaveBeenCalledOnce();
			expect(listener3).toHaveBeenCalledOnce();
		});

		test("should support listeners on multiple channels", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			manager.subscribe(listener1, "state");
			manager.subscribe(listener2, "validation");

			manager.notifySubscribers(["state", "validation"]);

			expect(listener1).toHaveBeenCalledOnce();
			expect(listener2).toHaveBeenCalledOnce();
		});
	});

	describe("isFirstStep calculation", () => {
		test("should mark step as first when current step matches initial", () => {
			const machine = createMockMachine<{ name: string }>();
			const manager = new WizardStateManager(machine, "step-1");

			const navSnapshot = manager.getNavigationSnapshot();
			expect(navSnapshot.isFirstStep).toBe(true);
		});

		test("should not mark step as first when current step differs from initial", () => {
			const machine = createMockMachine<{ name: string }>();
			machine.snapshot.currentStepId = "step-2";
			const manager = new WizardStateManager(machine, "step-1");

			const navSnapshot = manager.getNavigationSnapshot();
			expect(navSnapshot.isFirstStep).toBe(false);
		});
	});
});
