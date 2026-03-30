import { describe, expect, it, vi } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface TestData extends Record<string, unknown> {
	name: string;
	age: number;
	plan: string;
}

const defaultContext = {};

const defaultData: TestData = {
	name: "",
	age: 0,
	plan: "basic",
};

/** Simple linear 4-step wizard */
function createLinearDefinition(): WizardDefinition<TestData> {
	return {
		id: "linear-history",
		initialStepId: "personal",
		steps: {
			personal: {
				id: "personal",
				next: { type: "static", to: "plan" },
			},
			plan: {
				id: "plan",
				previous: { type: "static", to: "personal" },
				next: { type: "static", to: "invoice" },
			},
			invoice: {
				id: "invoice",
				previous: { type: "static", to: "plan" },
				next: { type: "static", to: "summary" },
			},
			summary: {
				id: "summary",
				previous: { type: "static", to: "invoice" },
			},
		},
	};
}

/** Wizard with conditional branching on plan selection */
function createConditionalDefinition(): WizardDefinition<TestData> {
	return {
		id: "conditional-history",
		initialStepId: "personal",
		steps: {
			personal: {
				id: "personal",
				next: {
					type: "conditional",
					branches: [
						{
							when: (d: TestData) => d.plan === "premium",
							to: "premium-details",
						},
						{ when: () => true, to: "basic-details" },
					],
				},
			},
			"premium-details": {
				id: "premium-details",
				previous: { type: "static", to: "personal" },
				next: { type: "static", to: "summary" },
			},
			"basic-details": {
				id: "basic-details",
				previous: { type: "static", to: "personal" },
				next: { type: "static", to: "summary" },
			},
			summary: {
				id: "summary",
				// Note: previous resolver would pick the WRONG step if data changed
				previous: {
					type: "conditional",
					branches: [
						{
							when: (d: TestData) => d.plan === "premium",
							to: "premium-details",
						},
						{ when: () => true, to: "basic-details" },
					],
				},
			},
		},
	};
}

describe("Navigation History Stack", () => {
	describe("Linear navigation", () => {
		it("should push steps onto the stack when navigating forward", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			expect(machine.history).toEqual(["personal"]);

			await machine.goNext();
			expect(machine.history).toEqual(["personal", "plan"]);

			await machine.goNext();
			expect(machine.history).toEqual(["personal", "plan", "invoice"]);

			await machine.goNext();
			expect(machine.history).toEqual([
				"personal",
				"plan",
				"invoice",
				"summary",
			]);
		});

		it("should pop from the stack when calling goPrevious()", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice
			await machine.goNext(); // → summary

			await machine.goPrevious(); // ← invoice
			expect(machine.snapshot.currentStepId).toBe("invoice");
			expect(machine.history).toEqual(["personal", "plan", "invoice"]);

			await machine.goPrevious(); // ← plan
			expect(machine.snapshot.currentStepId).toBe("plan");
			expect(machine.history).toEqual(["personal", "plan"]);

			await machine.goPrevious(); // ← personal
			expect(machine.snapshot.currentStepId).toBe("personal");
			expect(machine.history).toEqual(["personal"]);
		});
	});

	describe("Conditional transition regression", () => {
		it("should go back to the ACTUAL previous step, not the resolved one", async () => {
			// This is the core bug fix: user goes personal → basic-details → summary
			// Then changes plan data to "premium". Without history, previous resolver
			// would send them to "premium-details" (wrong!). With history stack, they
			// go back to "basic-details" (correct).
			const machine = new WizardMachine(
				createConditionalDefinition(),
				defaultContext,
				{ ...defaultData, plan: "basic" },
			);

			// Navigate: personal → basic-details → summary
			await machine.goNext(); // personal → basic-details
			expect(machine.snapshot.currentStepId).toBe("basic-details");

			await machine.goNext(); // basic-details → summary
			expect(machine.snapshot.currentStepId).toBe("summary");

			// User changes plan data at summary (e.g. edits inline)
			machine.updateData((d) => ({ ...d, plan: "premium" }));

			// Now go back — should go to basic-details (actual history),
			// NOT premium-details (what the resolver would return)
			await machine.goPrevious();
			expect(machine.snapshot.currentStepId).toBe("basic-details");
			expect(machine.history).toEqual(["personal", "basic-details"]);
		});

		it("should correctly navigate premium branch and go back", async () => {
			const machine = new WizardMachine(
				createConditionalDefinition(),
				defaultContext,
				{ ...defaultData, plan: "premium" },
			);

			await machine.goNext(); // personal → premium-details
			expect(machine.snapshot.currentStepId).toBe("premium-details");

			await machine.goNext(); // premium-details → summary
			expect(machine.snapshot.currentStepId).toBe("summary");

			await machine.goPrevious(); // summary ← premium-details
			expect(machine.snapshot.currentStepId).toBe("premium-details");

			await machine.goPrevious(); // premium-details ← personal
			expect(machine.snapshot.currentStepId).toBe("personal");
			expect(machine.history).toEqual(["personal"]);
		});
	});

	describe("Stack round-trip", () => {
		it("should rebuild the stack when navigating forward again", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			// Forward
			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice

			// Back
			await machine.goPrevious(); // ← plan
			expect(machine.history).toEqual(["personal", "plan"]);

			// Forward again
			await machine.goNext(); // → invoice (re-pushed)
			expect(machine.history).toEqual(["personal", "plan", "invoice"]);
			expect(machine.snapshot.currentStepId).toBe("invoice");
		});
	});

	describe("Empty stack fallback", () => {
		it("should use transition resolver when history has only one entry", async () => {
			// Create a machine at step2 with only step2 in history (simulates edge case)
			const definition: WizardDefinition<TestData> = {
				id: "fallback-test",
				initialStepId: "step2",
				steps: {
					step1: {
						id: "step1",
						next: { type: "static", to: "step2" },
					},
					step2: {
						id: "step2",
						previous: { type: "static", to: "step1" },
						next: { type: "static", to: "step3" },
					},
					step3: {
						id: "step3",
						previous: { type: "static", to: "step2" },
					},
				},
			};

			const machine = new WizardMachine(
				definition,
				defaultContext,
				defaultData,
			);

			// History only has the initial step
			expect(machine.history).toEqual(["step2"]);

			// goPrevious should fall back to resolver → step1
			await machine.goPrevious();
			expect(machine.snapshot.currentStepId).toBe("step1");
		});
	});

	describe("goToStep adds to history", () => {
		it("should push the target step onto the history stack", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice

			// Jump directly to personal
			await machine.goToStep("personal");

			expect(machine.snapshot.currentStepId).toBe("personal");
			expect(machine.history).toEqual([
				"personal",
				"plan",
				"invoice",
				"personal",
			]);
		});

		it("should be able to go back after goToStep", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goToStep("summary"); // jump to summary
			expect(machine.history).toEqual(["personal", "plan", "summary"]);

			await machine.goPrevious(); // ← plan (from history, not resolver)
			expect(machine.snapshot.currentStepId).toBe("plan");
			expect(machine.history).toEqual(["personal", "plan"]);
		});
	});

	describe("canGoBack", () => {
		it("should be false on the initial step", () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			expect(machine.snapshot.canGoBack).toBe(false);
		});

		it("should be true after navigating forward", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext();
			expect(machine.snapshot.canGoBack).toBe(true);
		});

		it("should become false when navigating back to the first step", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			expect(machine.snapshot.canGoBack).toBe(true);

			await machine.goPrevious(); // ← personal
			expect(machine.snapshot.canGoBack).toBe(false);
		});

		it("should reflect history size correctly through navigation", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			expect(machine.snapshot.canGoBack).toBe(false); // [personal]

			await machine.goNext(); // [personal, plan]
			expect(machine.snapshot.canGoBack).toBe(true);

			await machine.goNext(); // [personal, plan, invoice]
			expect(machine.snapshot.canGoBack).toBe(true);

			await machine.goPrevious(); // [personal, plan]
			expect(machine.snapshot.canGoBack).toBe(true);

			await machine.goPrevious(); // [personal]
			expect(machine.snapshot.canGoBack).toBe(false);
		});
	});

	describe("clearHistory", () => {
		it("should reset the stack to only the current step", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice
			expect(machine.history).toEqual(["personal", "plan", "invoice"]);

			machine.clearHistory();
			expect(machine.history).toEqual(["invoice"]);
			expect(machine.snapshot.currentStepId).toBe("invoice");
		});

		it("should set canGoBack to false after clearing", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext();
			expect(machine.snapshot.canGoBack).toBe(true);

			machine.clearHistory();
			expect(machine.snapshot.canGoBack).toBe(false);
		});

		it("should emit onStateChange when clearing history", async () => {
			const onStateChange = vi.fn();
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
				{ onStateChange },
			);

			await machine.goNext();
			onStateChange.mockClear();

			machine.clearHistory();
			expect(onStateChange).toHaveBeenCalledTimes(1);
		});
	});

	describe("Deprecated goBack(steps)", () => {
		it("should pop N steps from the stack", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice
			await machine.goNext(); // → summary
			expect(machine.history).toEqual([
				"personal",
				"plan",
				"invoice",
				"summary",
			]);

			await machine.goBack(2); // pop 2 → plan
			expect(machine.snapshot.currentStepId).toBe("plan");
			expect(machine.history).toEqual(["personal", "plan"]);
		});

		it("should work for goBack(1) equivalent to goPrevious()", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan
			await machine.goNext(); // → invoice

			await machine.goBack(1);
			expect(machine.snapshot.currentStepId).toBe("plan");
			expect(machine.history).toEqual(["personal", "plan"]);
		});

		it("should throw when going back more steps than history allows", async () => {
			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
			);

			await machine.goNext(); // → plan (history length = 2)

			await expect(machine.goBack(3)).rejects.toThrow("Cannot go back");
		});
	});

	describe("Event emission during stack navigation", () => {
		it("should emit onStepLeave and onStepEnter when popping", async () => {
			const onStepLeave = vi.fn();
			const onStepEnter = vi.fn();

			const machine = new WizardMachine(
				createLinearDefinition(),
				defaultContext,
				defaultData,
				{ onStepLeave, onStepEnter },
			);

			// Wait for initial onStepEnter
			await new Promise<void>((resolve) => queueMicrotask(resolve));
			onStepEnter.mockClear();

			await machine.goNext(); // → plan
			expect(onStepLeave).toHaveBeenCalledWith("personal", expect.any(Object));
			expect(onStepEnter).toHaveBeenCalledWith("plan", expect.any(Object));

			onStepLeave.mockClear();
			onStepEnter.mockClear();

			await machine.goPrevious(); // ← personal (pop)
			expect(onStepLeave).toHaveBeenCalledWith("plan", expect.any(Object));
			expect(onStepEnter).toHaveBeenCalledWith("personal", expect.any(Object));
		});
	});
});
