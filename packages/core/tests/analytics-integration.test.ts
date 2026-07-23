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

	it("recovers currentStep and timings after a step's onEnter throws once (FIX F4 desync)", async () => {
		const clock = makeClock();
		const onStepComplete: Array<[string, number]> = [];
		const analytics = createAnalyticsPlugin<SimpleData>({
			now: clock.now,
			onStepComplete: (stepId, ms) => onStepComplete.push([stepId, ms]),
		});

		const def = createSimpleLinearDefinition();
		let entered = 0;
		// step2.onEnter throws the FIRST time it is entered, succeeds afterwards.
		(def.steps.step2 as { onEnter?: unknown }).onEnter = () => {
			entered += 1;
			if (entered === 1) throw new Error("boom");
		};

		const m = new WizardMachine<SimpleData>(def, {}, initial, {}, [analytics]);
		await flush(); // onInit at step1

		clock.advance(100);
		// step1 -> step2 : machine commits to step2, onEnter throws; afterTransition skipped.
		await expect(m.goNext()).rejects.toThrow("boom");
		await flush(); // let the fire-and-forget onError resync run

		// onError resynced the plugin to the committed step2.
		expect(analytics.getReport().currentStep).toBe("step2");

		clock.advance(200);
		await m.goNext(); // step2 -> step3 (onEnter of step3 fine)
		await flush();

		// currentStep is correct, and step2's timer was attributed to step2 (not step1).
		const report = analytics.getReport();
		expect(report.currentStep).toBe("step3");
		// step2 completed with its real dwell (~200ms) — NOT folded into step1.
		expect(onStepComplete).toContainEqual(["step2", 200]);
		expect(report.stepTimings.step1).toBe(100);
		expect(report.stepTimings.step2).toBe(200);
	});
});
