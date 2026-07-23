import { describe, expect, it } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import { createAnalyticsPlugin } from "../src/plugins/analytics";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

// controllable clock, injected into the analytics plugin for deterministic durations
const makeClock = () => {
	let t = 1000;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
};

describe("createAnalyticsPlugin — integration with a real WizardMachine", () => {
	it("tracks onStepView sequence, backtrackCount, onWizardComplete and onDropOff across real navigation", async () => {
		const clock = makeClock();
		const stepViews: string[] = [];
		let backtrackCount = 0;
		let wizardCompleted: { data: SimpleData; total: number } | undefined;

		const analytics = createAnalyticsPlugin<SimpleData>({
			now: clock.now,
			onStepView: (stepId) => stepViews.push(stepId),
			onBacktrack: () => {
				backtrackCount += 1;
			},
			onWizardComplete: (data, total) => {
				wizardCompleted = { data: data as SimpleData, total };
			},
		});

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[analytics],
		);
		await flush(); // onInit is fire-and-forget

		clock.advance(100);
		await m.goNext(); // step1 -> step2
		clock.advance(50);
		await m.goPrevious(); // step2 -> step1 (backtrack)
		clock.advance(75);
		await m.goNext(); // step1 -> step2
		clock.advance(120);
		await m.goTo("step3", { skipValidation: true }); // step2 -> step3
		clock.advance(200);
		await m.submit(); // completes on step3
		await flush();

		expect(stepViews).toEqual(["step1", "step2", "step1", "step2", "step3"]);
		expect(backtrackCount).toBe(1);
		expect(wizardCompleted).toBeDefined();
		expect(wizardCompleted?.data.name).toBe("a");

		const report = analytics.getReport();
		expect(report.completed).toBe(true);
		expect(report.backtrackCount).toBe(1);
	});

	it("emits onDropOff when destroy() is called before completion", async () => {
		const clock = makeClock();
		let dropOff: { stepId: string; duration: number } | undefined;
		const analytics = createAnalyticsPlugin<SimpleData>({
			now: clock.now,
			onDropOff: (stepId, durationMs) => {
				dropOff = { stepId, duration: durationMs };
			},
		});

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[analytics],
		);
		await flush();

		clock.advance(60);
		await m.goNext(); // step1 -> step2
		clock.advance(90);
		await m.destroy();

		expect(dropOff).toEqual({ stepId: "step2", duration: 90 });
		expect(analytics.getReport().completed).toBe(false);
	});
});
