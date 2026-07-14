import { describe, expect, it, vi } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardDefinition } from "../src/types/definition";

interface TestData extends Record<string, unknown> {
	name: string;
}

const defaultContext = {};

describe("navigateToStep onEnter throw (F4)", () => {
	it("emits the committed target snapshot before the onEnter error propagates", async () => {
		const onStateChange = vi.fn();
		const onError = vi.fn();
		const def: WizardDefinition<TestData> = {
			id: "x",
			initialStepId: "b",
			steps: {
				b: { id: "b", next: { type: "static", to: "c" } },
				c: {
					id: "c",
					previous: { type: "static", to: "b" },
					onEnter: async () => {
						throw new Error("load failed");
					},
				},
			},
		};
		const machine = new WizardMachine(
			def,
			defaultContext,
			{ name: "Ada" },
			{ onStateChange, onError },
		);

		await expect(machine.goNext()).rejects.toThrow("load failed");

		const last = onStateChange.mock.calls.at(-1)?.[0];
		// The last emit must reflect the committed target step, not the origin.
		expect(last.currentStepId).toBe("c");
		// State is NOT rolled back.
		expect(machine.snapshot.currentStepId).toBe("c");
		// The error is reported exactly once (phase "transition").
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
