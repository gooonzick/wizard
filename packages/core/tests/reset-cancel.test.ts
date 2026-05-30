import { beforeEach, describe, expect, it, vi } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";
import {
	createEventSpies,
	createSimpleLinearDefinition,
	type SimpleData,
} from "./fixtures";

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("WizardMachine - reset()", () => {
	let machine: WizardMachine<SimpleData>;
	let events: Required<ReturnType<typeof createEventSpies<SimpleData>>>;
	let initialData: SimpleData;

	beforeEach(() => {
		initialData = { name: "alice", email: "alice@example.com" };
		events = createEventSpies<SimpleData>();
		machine = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initialData,
			events,
		);
	});

	it("returns to the initial step", async () => {
		await machine.goNext();
		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("step3");

		machine.reset();
		expect(machine.snapshot.currentStepId).toBe("step1");
	});

	it("restores a deep clone of the original data", () => {
		machine.updateData((d) => ({ ...d, name: "bob" }));
		expect(machine.snapshot.data.name).toBe("bob");

		machine.reset();
		expect(machine.snapshot.data).toEqual(initialData);
		// Mutating the snapshot must not change the seed for future resets.
		machine.snapshot.data.name = "mallory";
		machine.reset();
		expect(machine.snapshot.data.name).toBe("alice");
	});

	it("clears history, visited steps, canGoBack and validationErrors", async () => {
		await machine.goNext();
		await machine.goNext();
		expect(machine.history.length).toBeGreaterThan(1);
		expect(machine.snapshot.canGoBack).toBe(true);

		machine.reset();
		expect(machine.history).toEqual(["step1"]);
		expect(machine.visited).toEqual(["step1"]);
		expect(machine.snapshot.canGoBack).toBe(false);
		expect(machine.snapshot.validationErrors).toBeUndefined();
		expect(machine.snapshot.isCompleted).toBe(false);
	});

	it("re-fires onStepEnter for the initial step", async () => {
		await flushAsync();
		vi.mocked(events.onStepEnter).mockClear();

		machine.reset();
		await flushAsync();

		expect(events.onStepEnter).toHaveBeenCalledWith("step1", expect.anything());
	});

	it("fires onReset event", () => {
		machine.reset();
		expect(events.onReset).toHaveBeenCalledTimes(1);
	});

	it("accepts new initial data that becomes the new seed", () => {
		const fresh: SimpleData = { name: "carol", email: "carol@example.com" };
		machine.reset(fresh);
		expect(machine.snapshot.data).toEqual(fresh);

		machine.updateData((d) => ({ ...d, name: "dave" }));
		machine.reset();
		expect(machine.snapshot.data).toEqual(fresh);
	});
});

describe("WizardMachine - cancel()", () => {
	let initialData: SimpleData;

	beforeEach(() => {
		initialData = { name: "alice", email: "alice@example.com" };
	});

	it("awaits definition.onCancel before resetting", async () => {
		const calls: string[] = [];
		const definition: WizardDefinition<SimpleData> = {
			...createSimpleLinearDefinition(),
			onCancel: vi.fn(async () => {
				await flushAsync();
				calls.push("definition.onCancel");
			}),
		};
		const events = createEventSpies<SimpleData>();
		events.onReset = vi.fn(() => {
			calls.push("onReset");
		});
		const machine = new WizardMachine<SimpleData>(
			definition,
			{},
			initialData,
			events,
		);
		await machine.goNext();

		await machine.cancel();

		expect(definition.onCancel).toHaveBeenCalledWith(
			expect.objectContaining({ name: "alice" }),
			{},
		);
		expect(calls).toEqual(["definition.onCancel", "onReset"]);
		expect(machine.snapshot.currentStepId).toBe("step1");
	});

	it("awaits events.onCancel before resetting", async () => {
		const events = createEventSpies<SimpleData>();
		const order: string[] = [];
		events.onCancel = vi.fn(async () => {
			await flushAsync();
			order.push("event.onCancel");
		});
		events.onReset = vi.fn(() => {
			order.push("onReset");
		});
		const machine = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initialData,
			events,
		);
		await machine.goNext();

		await machine.cancel();

		expect(events.onCancel).toHaveBeenCalled();
		expect(order).toEqual(["event.onCancel", "onReset"]);
	});

	it("without handlers behaves like reset()", async () => {
		const events = createEventSpies<SimpleData>();
		const machine = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initialData,
			events,
		);
		await machine.goNext();

		await machine.cancel();

		expect(machine.snapshot.currentStepId).toBe("step1");
		expect(events.onReset).toHaveBeenCalled();
	});

	it("propagates errors from definition.onCancel and triggers onError", async () => {
		const failure = new Error("cancel failed");
		const definition: WizardDefinition<SimpleData> = {
			...createSimpleLinearDefinition(),
			onCancel: vi.fn(async () => {
				throw failure;
			}),
		};
		const events = createEventSpies<SimpleData>();
		const machine = new WizardMachine<SimpleData>(
			definition,
			{},
			initialData,
			events,
		);

		await expect(machine.cancel()).rejects.toBe(failure);
		expect(events.onError).toHaveBeenCalledWith(failure);
		// FIX 1: cancel ALWAYS resets to the initial state, even when a cancel
		// handler throws; the error is surfaced after the reset has run.
		expect(events.onReset).toHaveBeenCalled();
	});
});
