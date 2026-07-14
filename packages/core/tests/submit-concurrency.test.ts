import { describe, expect, it, vi } from "vitest";
import { WizardNavigationError } from "../src/errors";
import {
	type WizardEvents,
	WizardMachine,
} from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface TestData extends Record<string, unknown> {
	name: string;
}

const defaultContext = {};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createMachine(
	definition: WizardDefinition<TestData>,
	events?: WizardEvents<TestData>,
): WizardMachine<TestData> {
	return new WizardMachine(definition, defaultContext, { name: "Ada" }, events);
}

describe("submit() concurrency (F5)", () => {
	it("rejects a concurrent submit() and invokes onSubmit exactly once", async () => {
		const onSubmitSpy = vi.fn(async () => {
			await tick();
		});
		const def: WizardDefinition<TestData> = {
			id: "x",
			initialStepId: "a",
			steps: {
				// Last step (no `next`) so submit() runs the full path.
				a: { id: "a", onSubmit: onSubmitSpy },
			},
		};
		const machine = createMachine(def);

		const results = await Promise.allSettled([
			machine.submit(),
			machine.submit(),
		]);

		expect(onSubmitSpy).toHaveBeenCalledTimes(1);
		const rejected = results.filter((r) => r.status === "rejected");
		expect(rejected).toHaveLength(1);
		const reason = (rejected[0] as PromiseRejectedResult).reason;
		expect(reason).toBeInstanceOf(WizardNavigationError);
		expect((reason as WizardNavigationError).reason).toBe("busy");
	});

	it("rejects submit() racing goNext() and invokes onSubmit exactly once", async () => {
		const onSubmitSpy = vi.fn(async () => {
			await tick();
		});
		const def: WizardDefinition<TestData> = {
			id: "x",
			initialStepId: "a",
			steps: {
				a: {
					id: "a",
					onSubmit: onSubmitSpy,
					next: { type: "static", to: "b" },
				},
				b: { id: "b", previous: { type: "static", to: "a" } },
			},
		};
		const machine = createMachine(def);

		const results = await Promise.allSettled([
			machine.submit(),
			machine.goNext(),
		]);

		expect(onSubmitSpy).toHaveBeenCalledTimes(1);
		const rejected = results.filter((r) => r.status === "rejected");
		expect(rejected).toHaveLength(1);
		const reason = (rejected[0] as PromiseRejectedResult).reason;
		expect(reason).toBeInstanceOf(WizardNavigationError);
		expect((reason as WizardNavigationError).reason).toBe("busy");
	});

	it("exposes isBusy === true while a submit() is in flight", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const def: WizardDefinition<TestData> = {
			id: "x",
			initialStepId: "a",
			steps: {
				a: {
					id: "a",
					onSubmit: async () => {
						await gate;
					},
				},
			},
		};
		const machine = createMachine(def);

		const p = machine.submit();
		// Let submit() progress past validate() into onSubmit's await.
		await tick();
		expect(machine.isBusy).toBe(true);

		release();
		await p;
		expect(machine.isBusy).toBe(false);
	});
});
