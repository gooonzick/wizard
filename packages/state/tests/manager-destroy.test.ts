import { createLinearWizard, WizardMachine } from "@gooonzick/wizard-core";
import { describe, expect, it } from "vitest";
import { WizardStateManager } from "../src/manager";

interface D extends Record<string, unknown> {
	name: string;
}

const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("WizardStateManager.destroy", () => {
	it("calls machine.destroy() so plugin destroy hooks run (reverse order)", async () => {
		const order: string[] = [];
		const machine = new WizardMachine<D>(def, {}, { name: "" }, {}, [
			{ name: "a", destroy: () => void order.push("a") },
			{ name: "b", destroy: () => void order.push("b") },
		]);
		const manager = new WizardStateManager(machine, def.initialStepId);
		await manager.destroy();
		expect(order).toEqual(["b", "a"]);
	});
});
