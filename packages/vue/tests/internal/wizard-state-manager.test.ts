import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WizardStateManager } from "../../src/internal/wizard-state-manager";

describe("WizardStateManager", () => {
	let manager: WizardStateManager<{ name: string }>;
	let machine: WizardMachine<{ name: string }>;

	beforeEach(() => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test",
			steps: [
				{
					id: "step1",
				},
				{
					id: "step2",
				},
			],
		});

		machine = new WizardMachine(definition, {}, { name: "" }, {});
		manager = new WizardStateManager(machine);
	});

	it("should return current snapshot", () => {
		const snapshot = manager.getSnapshot();
		expect(snapshot).toBeDefined();
		expect(snapshot.currentStepId).toBe("step1");
		expect(snapshot.data).toEqual({ name: "" });
	});

	it("should return current step definition", () => {
		const currentStep = manager.getCurrentStep();
		expect(currentStep).toBeDefined();
		expect(currentStep.id).toBe("step1");
	});

	it("should compute navigation state", async () => {
		const nav = await manager.getNavigationState();
		expect(nav).toHaveProperty("canGoNext");
		expect(nav).toHaveProperty("canGoPrevious");
		expect(nav).toHaveProperty("availableSteps");
		expect(nav).toHaveProperty("isFirstStep");
		expect(nav).toHaveProperty("isLastStep");
		expect(nav).toHaveProperty("visitedSteps");
		expect(nav).toHaveProperty("stepHistory");
		expect(nav.canGoNext).toBe(true);
		expect(nav.canGoPrevious).toBe(false);
		expect(nav.availableSteps).toEqual(["step1", "step2"]);
		expect(nav.isFirstStep).toBe(true);
		expect(nav.isLastStep).toBe(false);
	});

	it("should cache navigation state and only recompute when dirty", async () => {
		// First call should compute
		const nav1 = await manager.getNavigationState();
		expect(nav1.canGoNext).toBe(true);

		// Second call should return cached value
		const nav2 = await manager.getNavigationState();
		expect(nav2).toEqual(nav1);
	});

	it("should handle concurrent getNavigationState calls without redundant computation", async () => {
		// Wait for initial navigation computation to complete
		await manager.getNavigationState();

		// Track how many times the machine methods are called
		let getNextStepIdCallCount = 0;
		let getPreviousStepIdCallCount = 0;
		let getAvailableStepsCallCount = 0;

		const originalGetNextStepId = machine.getNextStepId.bind(machine);
		const originalGetPreviousStepId = machine.getPreviousStepId.bind(machine);
		const originalGetAvailableSteps = machine.getAvailableSteps.bind(machine);

		machine.getNextStepId = async () => {
			getNextStepIdCallCount++;
			return originalGetNextStepId();
		};

		machine.getPreviousStepId = async () => {
			getPreviousStepIdCallCount++;
			return originalGetPreviousStepId();
		};

		machine.getAvailableSteps = async () => {
			getAvailableStepsCallCount++;
			return originalGetAvailableSteps();
		};

		// Navigate to trigger new computation
		await machine.goNext();
		manager.notifySubscribers(["navigation"]);

		// Make 3 concurrent calls - should share same promise
		const [nav1, nav2, nav3] = await Promise.all([
			manager.getNavigationState(),
			manager.getNavigationState(),
			manager.getNavigationState(),
		]);

		// All should return the same result
		expect(nav1).toEqual(nav2);
		expect(nav2).toEqual(nav3);

		// But the machine methods should only be called once (not three times)
		expect(getNextStepIdCallCount).toBe(1);
		expect(getPreviousStepIdCallCount).toBe(1);
		expect(getAvailableStepsCallCount).toBe(1);

		// Verify the actual navigation state is correct for step2
		expect(nav1.canGoNext).toBe(false);
		expect(nav1.canGoPrevious).toBe(true);
		expect(nav1.availableSteps).toEqual(["step1", "step2"]);
	});

	it("should mark navigation state as dirty after notifySubscribers", async () => {
		// Initial computation
		await manager.getNavigationState();

		// Navigate to next step
		await machine.goNext();

		// Mark as dirty
		manager.notifySubscribers(["navigation"]);

		// Next call should recompute
		const nav = await manager.getNavigationState();
		expect(nav.canGoNext).toBe(false);
		expect(nav.canGoPrevious).toBe(true);
	});

	describe("channel-based subscriptions", () => {
		it("should subscribe to all channels by default", () => {
			return new Promise<void>((resolve) => {
				let callCount = 0;
				manager.subscribe(() => {
					callCount++;
					if (callCount === 1) {
						expect(callCount).toBe(1);
						resolve();
					}
				});

				manager.notifySubscribers(["state"]);
			});
		});

		it("should subscribe to specific channel", () => {
			let stateCallCount = 0;
			let navigationCallCount = 0;

			manager.subscribe(() => {
				stateCallCount++;
			}, "state");

			manager.subscribe(() => {
				navigationCallCount++;
			}, "navigation");

			// Notify only state channel
			manager.notifySubscribers(["state"]);

			expect(stateCallCount).toBe(1);
			expect(navigationCallCount).toBe(0);
		});

		it("should notify all subscribers when multiple channels affected", () => {
			let stateCallCount = 0;
			let navigationCallCount = 0;
			let allCallCount = 0;

			manager.subscribe(() => {
				stateCallCount++;
			}, "state");

			manager.subscribe(() => {
				navigationCallCount++;
			}, "navigation");

			manager.subscribe(() => {
				allCallCount++;
			}, "all");

			// Notify both channels
			manager.notifySubscribers(["state", "navigation"]);

			expect(stateCallCount).toBe(1);
			expect(navigationCallCount).toBe(1);
			expect(allCallCount).toBe(1);
		});

		it("should unsubscribe from specific channel", () => {
			let callCount = 0;
			const unsubscribe = manager.subscribe(() => {
				callCount++;
			}, "state");

			manager.notifySubscribers(["state"]);
			expect(callCount).toBe(1);

			unsubscribe();

			manager.notifySubscribers(["state"]);
			expect(callCount).toBe(1);
		});
	});

	describe("state snapshots", () => {
		it("should return state snapshot", () => {
			const snapshot = manager.getStateSnapshot();
			expect(snapshot.currentStepId).toBe("step1");
			expect(snapshot.data).toEqual({ name: "" });
			expect(snapshot.isCompleted).toBe(false);
		});

		it("should return validation snapshot", () => {
			const validation = manager.getValidationSnapshot();
			expect(validation.isValid).toBe(true);
			expect(validation.validationErrors).toBeUndefined();
		});

		it("should return navigation snapshot", () => {
			const nav = manager.getNavigationSnapshot();
			expect(nav.isFirstStep).toBe(true);
			expect(nav.visitedSteps).toContain("step1");
		});

		it("should return loading snapshot", () => {
			const loading = manager.getLoadingSnapshot();
			expect(loading.isValidating).toBe(false);
			expect(loading.isSubmitting).toBe(false);
			expect(loading.isNavigating).toBe(false);
		});
	});

	describe("loading state management", () => {
		it("should update loading state", () => {
			manager.setLoadingState({ isValidating: true });
			expect(manager.getLoadingSnapshot().isValidating).toBe(true);

			manager.setLoadingState({ isSubmitting: true });
			expect(manager.getLoadingSnapshot().isSubmitting).toBe(true);
			expect(manager.getLoadingSnapshot().isValidating).toBe(true);
		});

		it("should notify loading subscribers when loading state changes", () => {
			const loadingCallback = vi.fn();
			manager.subscribe(loadingCallback, "loading");

			manager.setLoadingState({ isNavigating: true });

			expect(loadingCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe("handleStateChange", () => {
		it("should detect data changes and notify appropriate channels", () => {
			const stateCallback = vi.fn();
			const navigationCallback = vi.fn();
			const validationCallback = vi.fn();

			manager.subscribe(stateCallback, "state");
			manager.subscribe(navigationCallback, "navigation");
			manager.subscribe(validationCallback, "validation");

			const oldState = machine.snapshot;
			const newState = { ...oldState, data: { name: "updated" } };

			manager.handleStateChange(newState, oldState);

			expect(stateCallback).toHaveBeenCalled();
			expect(navigationCallback).toHaveBeenCalled();
			expect(validationCallback).toHaveBeenCalled();
		});

		it("should detect step changes and notify appropriate channels", () => {
			const stateCallback = vi.fn();
			const navigationCallback = vi.fn();
			const validationCallback = vi.fn();

			manager.subscribe(stateCallback, "state");
			manager.subscribe(navigationCallback, "navigation");
			manager.subscribe(validationCallback, "validation");

			const oldState = machine.snapshot;
			const newState = { ...oldState, currentStepId: "step2" };

			manager.handleStateChange(newState, oldState);

			expect(stateCallback).toHaveBeenCalled();
			expect(navigationCallback).toHaveBeenCalled();
			expect(validationCallback).not.toHaveBeenCalled();
		});

		it("should detect validation changes", () => {
			const validationCallback = vi.fn();
			manager.subscribe(validationCallback, "validation");

			const oldState = machine.snapshot;
			const newState = { ...oldState, isValid: false };

			manager.handleStateChange(newState, oldState);

			expect(validationCallback).toHaveBeenCalled();
		});

		it("should not notify if no changes detected", () => {
			const callback = vi.fn();
			manager.subscribe(callback, "all");

			const state = machine.snapshot;
			manager.handleStateChange(state, state);

			expect(callback).not.toHaveBeenCalled();
		});
	});

	it("should allow multiple subscribers", () => {
		let count1 = 0;
		let count2 = 0;

		manager.subscribe(() => {
			count1++;
		});
		manager.subscribe(() => {
			count2++;
		});

		manager.notifySubscribers();

		expect(count1).toBe(1);
		expect(count2).toBe(1);
	});

	it("should provide direct access to machine", () => {
		const machineRef = manager.getMachine();
		expect(machineRef).toBe(machine);
	});

	it("should return visited steps", () => {
		const visited = manager.getVisitedSteps();
		expect(visited).toEqual(["step1"]);
	});

	it("should return step history", () => {
		const history = manager.getStepHistory();
		expect(history).toEqual(["step1"]);
	});

	it("should update visited steps after navigation", async () => {
		await machine.goNext();
		const visited = manager.getVisitedSteps();
		expect(visited).toEqual(["step1", "step2"]);
	});

	it("should update step history after navigation", async () => {
		await machine.goNext();
		const history = manager.getStepHistory();
		expect(history).toEqual(["step1", "step2"]);
	});

	it("should return initial step ID", () => {
		expect(manager.getInitialStepId()).toBe("step1");
	});
});
