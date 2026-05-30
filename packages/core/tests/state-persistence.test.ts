import { describe, expect, it, vi } from "vitest";
import { WizardRestoreError } from "../src/errors";
import {
	type WizardEvents,
	WizardMachine,
	type WizardSerializedState,
} from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface PersistedData extends Record<string, unknown> {
	name: string;
	email: string;
	profile: {
		theme: string;
	};
}

const defaultContext = {};

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

function createDefinition(): WizardDefinition<PersistedData> {
	return {
		id: "persisted",
		initialStepId: "step1",
		steps: {
			step1: { id: "step1", next: { type: "static", to: "step2" } },
			step2: {
				id: "step2",
				previous: { type: "static", to: "step1" },
				next: { type: "static", to: "step3" },
			},
			step3: { id: "step3", previous: { type: "static", to: "step2" } },
		},
	};
}

function createData(overrides: Partial<PersistedData> = {}): PersistedData {
	return {
		name: "Ada",
		email: "ada@example.com",
		profile: { theme: "light" },
		...overrides,
	};
}

function createMachine(
	initialData: PersistedData = createData(),
	events?: WizardEvents<PersistedData>,
): WizardMachine<PersistedData> {
	return new WizardMachine(
		createDefinition(),
		defaultContext,
		initialData,
		events,
	);
}

describe("WizardMachine state persistence", () => {
	it("serializes the current runtime state without exposing mutable internals", async () => {
		const machine = createMachine();

		await machine.goNext();
		machine.updateData((data) => ({
			...data,
			name: "Grace",
			profile: { theme: "dark" },
		}));

		const serialized = machine.serialize();

		expect(serialized).toEqual({
			version: 1,
			currentStepId: "step2",
			data: {
				name: "Grace",
				email: "ada@example.com",
				profile: { theme: "dark" },
			},
			isValid: true,
			isCompleted: false,
			validationErrors: undefined,
			stepStatuses: {
				step1: "completed",
				step2: "active",
				step3: "pristine",
			},
			visitedSteps: ["step1", "step2"],
			history: ["step1", "step2"],
		} satisfies WizardSerializedState<PersistedData>);

		serialized.data.profile.theme = "mutated";
		serialized.stepStatuses.step2 = "error";
		serialized.history.push("step3");

		expect(machine.snapshot.data.profile.theme).toBe("dark");
		expect(machine.snapshot.stepStatuses.step2).toBe("active");
		expect(machine.history).toEqual(["step1", "step2"]);
	});

	it("restores serialized state and keeps history-based back navigation working", async () => {
		const source = createMachine();
		await source.goNext();
		await source.goNext();
		source.updateData((data) => ({
			...data,
			email: "grace@example.com",
		}));

		const serialized = source.serialize();

		const onStateChange = vi.fn();
		const onStepEnter = vi.fn();
		const onStepLeave = vi.fn();
		const onComplete = vi.fn();
		const events: WizardEvents<PersistedData> = {
			onStateChange,
			onStepEnter,
			onStepLeave,
			onComplete,
		};
		const target = createMachine(createData({ name: "Initial" }), events);

		await flushAsync();
		onStateChange.mockClear();
		onStepEnter.mockClear();
		onStepLeave.mockClear();
		onComplete.mockClear();

		target.restore(serialized);

		expect(target.snapshot.currentStepId).toBe("step3");
		expect(target.snapshot.data.email).toBe("grace@example.com");
		expect(target.snapshot.canGoBack).toBe(true);
		expect(target.history).toEqual(["step1", "step2", "step3"]);
		expect(target.visited).toEqual(["step1", "step2", "step3"]);
		expect(target.snapshot.stepStatuses).toEqual({
			step1: "completed",
			step2: "completed",
			step3: "active",
		});
		expect(onStateChange).toHaveBeenCalledTimes(1);
		expect(onStepEnter).not.toHaveBeenCalled();
		expect(onStepLeave).not.toHaveBeenCalled();
		expect(onComplete).not.toHaveBeenCalled();

		await target.goPrevious();

		expect(target.snapshot.currentStepId).toBe("step2");
		expect(target.history).toEqual(["step1", "step2"]);
	});

	it("rejects serialized state with an unsupported version", () => {
		const machine = createMachine();
		const serialized = machine.serialize();

		expect(() =>
			// @ts-expect-error - testing restore error handling for unsupported version
			machine.restore({
				...serialized,
				version: 2,
			} as WizardSerializedState<PersistedData>),
		).toThrow(WizardRestoreError);
	});

	it("rejects serialized state for unknown steps", () => {
		const machine = createMachine();
		const serialized = machine.serialize();

		expect(() =>
			machine.restore({
				...serialized,
				currentStepId: "missing",
				history: ["step1", "missing"],
			}),
		).toThrow('Serialized current step "missing" does not exist');

		expect(() =>
			machine.restore({
				...serialized,
				visitedSteps: ["step1", "missing"],
			}),
		).toThrow('Serialized step "missing" does not exist');

		expect(() =>
			machine.restore({
				...serialized,
				stepStatuses: {
					...serialized.stepStatuses,
					missing: "active",
				},
			}),
		).toThrow('Serialized step status references unknown step "missing"');
	});

	it("rejects serialized state with an empty history", () => {
		const machine = createMachine();
		const serialized = machine.serialize();

		expect(() =>
			machine.restore({
				...serialized,
				history: [],
			}),
		).toThrow("Serialized history must not be empty");
	});

	it("rejects serialized state whose history does not end at the current step", () => {
		const machine = createMachine();
		const serialized = machine.serialize();

		expect(() =>
			machine.restore({
				...serialized,
				currentStepId: "step2",
				history: ["step1"],
			}),
		).toThrow("Serialized history must end with the current step");
	});

	it("rejects serialized state with invalid step status values", () => {
		const machine = createMachine();
		const serialized = machine.serialize();

		expect(() =>
			machine.restore({
				...serialized,
				// @ts-expect-error - testing restore error handling for invalid step status
				stepStatuses: {
					...serialized.stepStatuses,
					step1: "done",
				} as WizardSerializedState<PersistedData>["stepStatuses"],
			}),
		).toThrow('Serialized step "step1" has invalid status "done"');
	});

	it("deep-clones restored data so later payload mutation cannot change state", () => {
		const source = createMachine();
		const serialized = source.serialize();
		const target = createMachine(createData({ name: "Initial" }));

		target.restore(serialized);
		serialized.data.profile.theme = "changed-after-restore";

		expect(target.snapshot.data.profile.theme).toBe("light");
	});
});
