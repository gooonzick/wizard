import { createLinearWizard, WizardMachine } from "@wizard/core";
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
		manager = new WizardStateManager(machine, "step1");
	});

	describe("snapshots", () => {
		it("should return current snapshot", () => {
			const snapshot = manager.getSnapshot();
			expect(snapshot).toBeDefined();
			expect(snapshot.currentStepId).toBe("step1");
			expect(snapshot.data).toEqual({ name: "" });
		});

		it("should return state snapshot", () => {
			const snapshot = manager.getStateSnapshot();
			expect(snapshot).toBeDefined();
			expect(snapshot.currentStepId).toBe("step1");
			expect(snapshot.data).toEqual({ name: "" });
			expect(snapshot.currentStep).toBeDefined();
			expect(snapshot.isCompleted).toBe(false);
		});

		it("should return current step definition", () => {
			const currentStep = manager.getCurrentStep();
			expect(currentStep).toBeDefined();
			expect(currentStep.id).toBe("step1");
		});

		it("should return navigation snapshot with defaults initially", () => {
			const nav = manager.getNavigationSnapshot();
			expect(nav).toHaveProperty("canGoNext");
			expect(nav).toHaveProperty("canGoPrevious");
			expect(nav).toHaveProperty("availableSteps");
			expect(nav).toHaveProperty("isFirstStep");
			expect(nav).toHaveProperty("isLastStep");
			expect(nav).toHaveProperty("visitedSteps");
			expect(nav).toHaveProperty("stepHistory");
		});

		it("should return validation snapshot", () => {
			const validation = manager.getValidationSnapshot();
			expect(validation).toHaveProperty("isValid");
			expect(validation).toHaveProperty("validationErrors");
			expect(validation.isValid).toBe(true);
		});

		it("should return loading snapshot", () => {
			const loading = manager.getLoadingSnapshot();
			expect(loading).toHaveProperty("isValidating");
			expect(loading).toHaveProperty("isSubmitting");
			expect(loading).toHaveProperty("isNavigating");
			expect(loading.isValidating).toBe(false);
			expect(loading.isSubmitting).toBe(false);
			expect(loading.isNavigating).toBe(false);
		});
	});

	describe("loading state management", () => {
		it("should update loading state", () => {
			manager.setLoadingState({ isValidating: true });
			expect(manager.getLoadingSnapshot().isValidating).toBe(true);
			expect(manager.getLoadingSnapshot().isSubmitting).toBe(false);
		});

		it("should merge loading state updates", () => {
			manager.setLoadingState({ isValidating: true });
			manager.setLoadingState({ isSubmitting: true });
			const loading = manager.getLoadingSnapshot();
			expect(loading.isValidating).toBe(true);
			expect(loading.isSubmitting).toBe(true);
		});
	});

	describe("channel-based subscriptions", () => {
		it("should subscribe to all channel by default", () => {
			const listener = vi.fn();
			manager.subscribe(listener);
			manager.notifySubscribers(["state"]);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("should subscribe to specific channel", () => {
			const stateListener = vi.fn();
			const navigationListener = vi.fn();

			manager.subscribe(stateListener, "state");
			manager.subscribe(navigationListener, "navigation");

			manager.notifySubscribers(["state"]);
			expect(stateListener).toHaveBeenCalledTimes(1);
			expect(navigationListener).toHaveBeenCalledTimes(0);
		});

		it("should notify all subscribers when their channel is triggered", () => {
			const allListener = vi.fn();
			const stateListener = vi.fn();
			const validationListener = vi.fn();

			manager.subscribe(allListener, "all");
			manager.subscribe(stateListener, "state");
			manager.subscribe(validationListener, "validation");

			manager.notifySubscribers(["state", "validation"]);

			expect(allListener).toHaveBeenCalledTimes(1);
			expect(stateListener).toHaveBeenCalledTimes(1);
			expect(validationListener).toHaveBeenCalledTimes(1);
		});

		it("should unsubscribe from specific channel", () => {
			const listener = vi.fn();
			const unsubscribe = manager.subscribe(listener, "state");

			manager.notifySubscribers(["state"]);
			expect(listener).toHaveBeenCalledTimes(1);

			unsubscribe();

			manager.notifySubscribers(["state"]);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("should allow multiple subscribers per channel", () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			manager.subscribe(listener1, "state");
			manager.subscribe(listener2, "state");

			manager.notifySubscribers(["state"]);

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);
		});
	});

	describe("handleStateChange", () => {
		it("should notify state channel on data change", () => {
			const stateListener = vi.fn();
			manager.subscribe(stateListener, "state");

			const oldState = { ...machine.snapshot };
			machine.updateData(() => ({ name: "test" }));
			const newState = machine.snapshot;

			manager.handleStateChange(newState, oldState);
			expect(stateListener).toHaveBeenCalled();
		});

		it("should notify validation channel on validation change", () => {
			const validationListener = vi.fn();
			manager.subscribe(validationListener, "validation");

			const oldState = { ...machine.snapshot, isValid: true };
			const newState = { ...machine.snapshot, isValid: false };

			manager.handleStateChange(newState, oldState);
			expect(validationListener).toHaveBeenCalled();
		});

		it("should notify multiple channels when multiple things change", () => {
			const stateListener = vi.fn();
			const navigationListener = vi.fn();

			manager.subscribe(stateListener, "state");
			manager.subscribe(navigationListener, "navigation");

			const oldState = { ...machine.snapshot };
			const newState = {
				...machine.snapshot,
				currentStepId: "step2",
				data: { name: "changed" },
			};

			manager.handleStateChange(newState, oldState);
			expect(stateListener).toHaveBeenCalled();
			expect(navigationListener).toHaveBeenCalled();
		});
	});

	describe("machine access", () => {
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

		it("should return initial step id", () => {
			expect(manager.getInitialStepId()).toBe("step1");
		});
	});
});
