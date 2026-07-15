import { describe, expect, it, vi } from "vitest";
import {
	type WizardEvents,
	WizardMachine,
} from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

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
				next: { type: "static", to: "step4" },
				previous: { type: "static", to: "step2" },
			},
			step4: {
				id: "step4",
				next: { type: "static", to: "step5" },
				previous: { type: "static", to: "step3" },
			},
			step5: {
				id: "step5",
				previous: { type: "static", to: "step4" },
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

describe("Progress API", () => {
	describe("initial snapshot", () => {
		it("reports zero progress on a fresh linear wizard", () => {
			const machine = createMachine(linearDefinition());
			const { progress } = machine.snapshot;

			expect(progress.totalSteps).toBe(5);
			expect(progress.enabledSteps).toBe(5);
			expect(progress.completedSteps).toBe(0);
			expect(progress.currentStepIndex).toBe(0);
			expect(progress.percentage).toBe(0);
			expect(progress.isFirstStep).toBe(true);
			expect(progress.isLastStep).toBe(false);
			expect(progress.enabledStepIds).toEqual([
				"step1",
				"step2",
				"step3",
				"step4",
				"step5",
			]);
		});
	});

	describe("after navigation", () => {
		it("advances currentStepIndex and percentage on goNext", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext();
			const { progress } = machine.snapshot;

			expect(progress.currentStepIndex).toBe(1);
			expect(progress.completedSteps).toBe(1);
			expect(progress.percentage).toBe(20);
			expect(progress.isFirstStep).toBe(false);
			expect(progress.isLastStep).toBe(false);
		});

		it("flags isLastStep on the final step", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext();
			await machine.goNext();
			await machine.goNext();
			await machine.goNext();
			const { progress } = machine.snapshot;

			expect(progress.currentStepIndex).toBe(4);
			expect(progress.completedSteps).toBe(4);
			expect(progress.percentage).toBe(80);
			expect(progress.isLastStep).toBe(true);
		});

		it("preserves completedSteps when going back to a completed step", async () => {
			const machine = createMachine(linearDefinition());

			await machine.goNext();
			await machine.goNext();
			expect(machine.snapshot.progress.completedSteps).toBe(2);

			await machine.goPrevious();
			const { progress } = machine.snapshot;
			expect(progress.currentStepIndex).toBe(1);
			// On goPrevious: step3 (departing) becomes "visited". step2 was already
			// "completed" (from the second goNext) and is PRESERVED, not downgraded
			// to "active". step1 also remains "completed". So the count stays at 2.
			expect(progress.completedSteps).toBe(2);
		});
	});

	describe("disabled steps", () => {
		it("excludes statically disabled steps from enabledStepIds", () => {
			const machine = createMachine(withDisabledStep());
			const { progress } = machine.snapshot;

			expect(progress.totalSteps).toBe(3);
			expect(progress.enabledSteps).toBe(2);
			expect(progress.enabledStepIds).toEqual(["step1", "step3"]);
			expect(progress.currentStepIndex).toBe(0);
		});

		it("reflects dynamically skipped status via setStepStatus", () => {
			const machine = createMachine(linearDefinition());

			machine.setStepStatus("step3", "skipped");
			const { progress } = machine.snapshot;

			expect(progress.enabledSteps).toBe(4);
			expect(progress.enabledStepIds).toEqual([
				"step1",
				"step2",
				"step4",
				"step5",
			]);
		});
	});

	describe("isLastStep resolution (F2/F3)", () => {
		it("does not throw from snapshot/serialize when a resolver throws synchronously", () => {
			const def: WizardDefinition<TestData> = {
				id: "x",
				initialStepId: "a",
				steps: {
					a: {
						id: "a",
						next: {
							type: "resolver",
							resolve: () => {
								throw new TypeError("boom");
							},
						},
					},
					b: { id: "b" },
				},
			};
			const machine = createMachine(def);

			expect(() => machine.snapshot).not.toThrow();
			expect(() => machine.serialize()).not.toThrow();
			// "unknown" (resolver threw) is reported conservatively as NOT last.
			expect(machine.snapshot.progress.isLastStep).toBe(false);
			expect(() => machine.updateData((d) => d)).not.toThrow();
		});

		it("reports a throwing resolver at most once per state change", async () => {
			const onError = vi.fn();
			const def: WizardDefinition<TestData> = {
				id: "x",
				initialStepId: "a",
				steps: {
					a: {
						id: "a",
						next: {
							type: "resolver",
							resolve: () => {
								throw new TypeError("boom");
							},
						},
					},
					b: { id: "b" },
				},
			};
			const machine = createMachine(def, {}, { onError });

			// Read the snapshot several times without mutating state.
			void machine.snapshot;
			void machine.snapshot;
			void machine.snapshot;

			// Error routing is deferred out of the snapshot call stack.
			await Promise.resolve();
			expect(onError.mock.calls.length).toBeLessThanOrEqual(1);
		});

		it("reports isLastStep false when the current step's next is async", () => {
			const def: WizardDefinition<TestData> = {
				id: "x",
				initialStepId: "b",
				steps: {
					b: {
						id: "b",
						next: { type: "resolver", resolve: async () => "c" },
					},
					c: { id: "c" },
				},
			};
			const machine = createMachine(def);

			expect(machine.snapshot.progress.isLastStep).toBe(false);
		});

		it("reports isLastStep false when the next step's enabled guard is async", () => {
			const def: WizardDefinition<TestData> = {
				id: "x",
				initialStepId: "b",
				steps: {
					b: { id: "b", next: { type: "static", to: "c" } },
					c: { id: "c", enabled: async () => true },
				},
			};
			const machine = createMachine(def);

			// Async guard is treated optimistically as enabled ⇒ a resolvable next
			// exists ⇒ not last.
			expect(machine.snapshot.progress.isLastStep).toBe(false);
		});
	});

	describe("event emissions", () => {
		it("includes progress in onStateChange snapshot", async () => {
			const onStateChange = vi.fn();
			const machine = createMachine(linearDefinition(), {}, { onStateChange });

			await machine.goNext();

			expect(onStateChange).toHaveBeenCalled();
			const lastCall =
				onStateChange.mock.calls[onStateChange.mock.calls.length - 1];
			const snapshot = lastCall[0];
			expect(snapshot.progress).toBeDefined();
			expect(snapshot.progress.currentStepIndex).toBe(1);
			expect(snapshot.progress.percentage).toBe(20);
		});
	});

	describe("progress immutability (M-a)", () => {
		it("freezes snapshot.progress and its enabledStepIds", () => {
			const machine = createMachine(linearDefinition());
			const { progress } = machine.snapshot;

			expect(Object.isFrozen(progress)).toBe(true);
			expect(Object.isFrozen(progress.enabledStepIds)).toBe(true);
			expect(() => {
				progress.enabledStepIds.push("intruder");
			}).toThrow();
			// A later, unrelated snapshot read for the same stateVersion must not
			// have been corrupted by the mutation attempt above.
			expect(machine.snapshot.progress.enabledStepIds).toEqual(
				progress.enabledStepIds,
			);
		});
	});
});
