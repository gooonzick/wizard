import { describe, expect, it, vi } from "vitest";
import { WizardValidationError } from "../src/errors";
import {
	type WizardEvents,
	WizardMachine,
} from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

// ── Shared types ──────────────────────────────────────────────

interface TestData extends Record<string, unknown> {
	name: string;
	needsInvoice: boolean;
}

const defaultContext = {};

function createMachine(
	definition: WizardDefinition<TestData>,
	data: Partial<TestData> = {},
	events?: WizardEvents<TestData>,
): WizardMachine<TestData> {
	const initialData: TestData = {
		name: "Ada",
		needsInvoice: true,
		...data,
	};
	return new WizardMachine(definition, defaultContext, initialData, events);
}

// ── Definitions ──────────────────────────────────────────────

function linearDefinition(): WizardDefinition<TestData> {
	return {
		id: "linear",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "step2" },
			},
			step2: {
				id: "step2",
				next: { type: "static", to: "step3" },
				previous: { type: "static", to: "step1" },
			},
			step3: {
				id: "step3",
				previous: { type: "static", to: "step2" },
			},
		},
	};
}

function validatedDefinition(): WizardDefinition<TestData> {
	return {
		id: "validated",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "step2" },
				validate: (data) => ({
					valid: !!data.name,
					errors: data.name ? undefined : { name: "Name is required" },
				}),
			},
			step2: {
				id: "step2",
				previous: { type: "static", to: "step1" },
			},
		},
	};
}

function withDisabledStep(): WizardDefinition<TestData> {
	return {
		id: "with-disabled",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "step2" },
			},
			step2: {
				id: "step2",
				enabled: false,
				next: { type: "static", to: "step3" },
				previous: { type: "static", to: "step1" },
			},
			step3: {
				id: "step3",
				previous: { type: "static", to: "step2" },
			},
		},
	};
}

function withDynamicGuard(): WizardDefinition<TestData> {
	return {
		id: "dynamic-guard",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "invoice" },
			},
			invoice: {
				id: "invoice",
				enabled: (data) => data.needsInvoice,
				next: { type: "static", to: "step3" },
				previous: { type: "static", to: "step1" },
			},
			step3: {
				id: "step3",
				previous: { type: "static", to: "invoice" },
			},
		},
	};
}

// ── Tests ──────────────────────────────────────────────

describe("Step Status Tracking", () => {
	describe("initialization", () => {
		it("sets initial step to active and all others to pristine", () => {
			const machine = createMachine(linearDefinition());
			const { stepStatuses } = machine.snapshot;

			expect(stepStatuses.step1).toBe("active");
			expect(stepStatuses.step2).toBe("pristine");
			expect(stepStatuses.step3).toBe("pristine");
		});

		it("sets statically disabled steps to skipped", () => {
			const machine = createMachine(withDisabledStep());
			const { stepStatuses } = machine.snapshot;

			expect(stepStatuses.step1).toBe("active");
			expect(stepStatuses.step2).toBe("skipped");
			expect(stepStatuses.step3).toBe("pristine");
		});

		it("sets dynamically guarded steps to pristine (not skipped)", () => {
			// Function guards are NOT eagerly evaluated — only static booleans
			const machine = createMachine(withDynamicGuard(), {
				needsInvoice: false,
			});
			const { stepStatuses } = machine.snapshot;

			expect(stepStatuses.step1).toBe("active");
			expect(stepStatuses.invoice).toBe("pristine");
			expect(stepStatuses.step3).toBe("pristine");
		});
	});

	describe("goNext", () => {
		it("marks current step as completed and next step as active", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext();
			const { stepStatuses } = machine.snapshot;

			expect(stepStatuses.step1).toBe("completed");
			expect(stepStatuses.step2).toBe("active");
			expect(stepStatuses.step3).toBe("pristine");
		});

		it("marks current step as error when validation fails", async () => {
			const machine = createMachine(validatedDefinition(), { name: "" });

			await expect(machine.goNext()).rejects.toThrow(WizardValidationError);

			const { stepStatuses } = machine.snapshot;
			expect(stepStatuses.step1).toBe("error");
		});

		it("emits the errored step status to subscribers on validation failure", async () => {
			// F1: driven via a subscriber (NOT machine.snapshot) — the last emitted
			// snapshot must carry the "error" status, not the pre-error "active".
			const onStateChange = vi.fn();
			const machine = createMachine(
				validatedDefinition(),
				{ name: "" },
				{ onStateChange },
			);

			await expect(machine.goNext()).rejects.toThrow(WizardValidationError);

			const lastSnapshot = onStateChange.mock.calls.at(-1)?.[0];
			expect(lastSnapshot.stepStatuses.step1).toBe("error");
			expect(lastSnapshot.isValid).toBe(false);
		});

		it("transitions through multiple steps correctly", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext(); // step1 → step2
			await machine.goNext(); // step2 → step3

			const { stepStatuses } = machine.snapshot;
			expect(stepStatuses.step1).toBe("completed");
			expect(stepStatuses.step2).toBe("completed");
			expect(stepStatuses.step3).toBe("active");
		});
	});

	describe("goPrevious", () => {
		it("marks current step as visited and preserves the completed previous step", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext(); // step1(completed) → step2
			await machine.goPrevious(); // step2 → step1

			const { stepStatuses } = machine.snapshot;
			// FIX 3: a completed step keeps its "completed" status when revisited.
			expect(stepStatuses.step1).toBe("completed");
			expect(stepStatuses.step2).toBe("visited");
		});

		it("preserves completed status when revisiting a previously completed step", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext(); // step1(completed) → step2
			await machine.goNext(); // step2(completed) → step3
			await machine.goPrevious(); // step3(visited) → step2

			const { stepStatuses } = machine.snapshot;
			// FIX 3: step2 stays "completed" on back-navigation, not downgraded to "active".
			expect(stepStatuses.step1).toBe("completed");
			expect(stepStatuses.step2).toBe("completed");
			expect(stepStatuses.step3).toBe("visited");
		});
	});

	describe("goTo", () => {
		it("marks current step as visited and target step as active", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goTo("step3", { skipValidation: true });

			const { stepStatuses } = machine.snapshot;
			expect(stepStatuses.step1).toBe("visited");
			expect(stepStatuses.step2).toBe("pristine");
			expect(stepStatuses.step3).toBe("active");
		});

		it("preserves completed status when navigating back to a completed step", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext(); // step1(completed) → step2
			await machine.goTo("step1", { skipValidation: true });

			const { stepStatuses } = machine.snapshot;
			// FIX 3: step1 stays "completed" when navigated back to, not re-activated.
			expect(stepStatuses.step1).toBe("completed");
			expect(stepStatuses.step2).toBe("visited");
		});

		it("re-activates an error step", async () => {
			const machine = createMachine(validatedDefinition(), { name: "" });

			// Try goNext — fails validation, step1 becomes error
			await expect(machine.goNext()).rejects.toThrow(WizardValidationError);
			expect(machine.snapshot.stepStatuses.step1).toBe("error");

			// Now goTo step2 (skipping validation), then back to step1
			await machine.goTo("step2", { skipValidation: true });
			await machine.goTo("step1", { skipValidation: true });

			expect(machine.snapshot.stepStatuses.step1).toBe("active");
		});
	});

	describe("clearHistory / reset", () => {
		it("reinitializes all step statuses on clearHistory", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext(); // step1(completed) → step2
			await machine.goNext(); // step2(completed) → step3

			machine.clearHistory();

			const { stepStatuses } = machine.snapshot;
			// After clearHistory, current step is step3 but statuses are reinitialized
			expect(stepStatuses.step1).toBe("pristine");
			expect(stepStatuses.step2).toBe("pristine");
			expect(stepStatuses.step3).toBe("active");
		});
	});

	describe("setStepStatus", () => {
		it("manually overrides step status", () => {
			const machine = createMachine(linearDefinition());

			machine.setStepStatus("step2", "completed");

			expect(machine.snapshot.stepStatuses.step2).toBe("completed");
		});

		it("emits onStateChange when status is manually set", () => {
			const onStateChange = vi.fn();
			const machine = createMachine(linearDefinition(), {}, { onStateChange });

			machine.setStepStatus("step2", "error");

			expect(onStateChange).toHaveBeenCalled();
			const latestState =
				onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
			expect(latestState.stepStatuses.step2).toBe("error");
		});

		it("throws when setting status for non-existent step", () => {
			const machine = createMachine(linearDefinition());

			expect(() => machine.setStepStatus("nonexistent", "active")).toThrow();
		});
	});

	describe("getStepStatus", () => {
		it("returns the current status of a step", () => {
			const machine = createMachine(linearDefinition());

			expect(machine.getStepStatus("step1")).toBe("active");
			expect(machine.getStepStatus("step2")).toBe("pristine");
		});
	});

	describe("stepStatuses flows through snapshot", () => {
		it("onStateChange receives updated stepStatuses", async () => {
			const onStateChange = vi.fn();
			const machine = createMachine(linearDefinition(), {}, { onStateChange });

			await machine.goNext();

			const lastCall =
				onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
			expect(lastCall.stepStatuses.step1).toBe("completed");
			expect(lastCall.stepStatuses.step2).toBe("active");
		});
	});

	describe("static enabled guard recalculation", () => {
		it("keeps skipped status for statically disabled steps after data changes", () => {
			const machine = createMachine(withDisabledStep());
			expect(machine.snapshot.stepStatuses.step2).toBe("skipped");

			machine.updateData((d) => ({ ...d, name: "changed" }));
			expect(machine.snapshot.stepStatuses.step2).toBe("skipped");
		});
	});
});
