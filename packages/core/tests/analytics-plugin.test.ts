import { describe, expect, it, vi } from "vitest";
import { createAnalyticsPlugin } from "../src/plugins/analytics";
import type { TransitionEvent } from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const machineView = (stepId: string) => ({
	snapshot: { currentStepId: stepId, data: { value: 1 } } as never,
	currentStep: { id: stepId } as never,
	getStepStatus: () => "active" as const,
});

const ev = (over: Partial<TransitionEvent<D>> = {}): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
	...over,
});

// controllable clock
const makeClock = () => {
	let t = 1000;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
};

describe("createAnalyticsPlugin", () => {
	it("has the fixed plugin name 'analytics'", () => {
		expect(createAnalyticsPlugin().name).toBe("analytics");
	});

	it("measures step time correctly across an afterTransition", () => {
		const clock = makeClock();
		const onStepComplete = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onStepComplete });
		plugin.onInit?.(machineView("a"));
		clock.advance(500);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		expect(onStepComplete).toHaveBeenCalledWith("a", 500);
		expect(plugin.getReport().stepTimings.a).toBe(500);
	});

	it("fires onStepView for the initial step (onInit) and each entered step (afterTransition)", () => {
		const clock = makeClock();
		const onStepView = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onStepView });
		plugin.onInit?.(machineView("a"));
		expect(onStepView).toHaveBeenCalledWith("a", { value: 1 });
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		expect(onStepView).toHaveBeenCalledWith("b", { value: 1 });
	});

	it("counts a backtrack via 'previous'", () => {
		const clock = makeClock();
		const onBacktrack = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onBacktrack });
		plugin.onInit?.(machineView("a"));
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		clock.advance(100);
		plugin.afterTransition?.(
			ev({ type: "previous", fromStepId: "b", toStepId: "a" }),
		);
		expect(onBacktrack).toHaveBeenCalledWith("b", "a");
		const report = plugin.getReport();
		expect(report.backtrackCount).toBe(1);
		expect(report.backtrackHistory).toHaveLength(1);
		expect(report.backtrackHistory[0]).toMatchObject({ from: "b", to: "a" });
		expect(report.backtrackHistory[0].at).toBe(clock.now());
	});

	it("counts a backtrack via 'goTo' to an already-viewed step, but not a forward 'goTo' to an unseen step", () => {
		const clock = makeClock();
		const onBacktrack = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onBacktrack });
		plugin.onInit?.(machineView("a"));
		// forward goTo to an unseen step "c" — not a backtrack
		plugin.afterTransition?.(
			ev({ type: "goTo", fromStepId: "a", toStepId: "c" }),
		);
		expect(onBacktrack).not.toHaveBeenCalled();
		expect(plugin.getReport().backtrackCount).toBe(0);
		// goTo back to "a", already viewed — is a backtrack
		plugin.afterTransition?.(
			ev({ type: "goTo", fromStepId: "c", toStepId: "a" }),
		);
		expect(onBacktrack).toHaveBeenCalledWith("c", "a");
		expect(plugin.getReport().backtrackCount).toBe(1);
	});

	it("accumulates timing across re-entry to the same step", () => {
		const clock = makeClock();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now });
		plugin.onInit?.(machineView("a"));
		clock.advance(100);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		); // a: 100
		clock.advance(50);
		plugin.afterTransition?.(
			ev({ type: "previous", fromStepId: "b", toStepId: "a" }),
		); // b: 50
		clock.advance(200);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		); // a: +200 = 300
		expect(plugin.getReport().stepTimings.a).toBe(300);
		expect(plugin.getReport().stepTimings.b).toBe(50);
	});

	it("fires onWizardComplete and onStepComplete for the terminal step on completion", () => {
		const clock = makeClock();
		const onWizardComplete = vi.fn();
		const onStepComplete = vi.fn();
		const plugin = createAnalyticsPlugin<D>({
			now: clock.now,
			onWizardComplete,
			onStepComplete,
		});
		plugin.onInit?.(machineView("a"));
		clock.advance(100);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		clock.advance(300);
		plugin.onComplete?.({ value: 1 });
		expect(onStepComplete).toHaveBeenCalledWith("a", 100);
		expect(onStepComplete).toHaveBeenCalledWith("b", 300);
		expect(onWizardComplete).toHaveBeenCalledWith({ value: 1 }, 400);
		const report = plugin.getReport();
		expect(report.completed).toBe(true);
		expect(report.totalDuration).toBe(400);
	});

	it("fires onDropOff on destroy of an incomplete wizard", () => {
		const clock = makeClock();
		const onDropOff = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onDropOff });
		plugin.onInit?.(machineView("a"));
		clock.advance(250);
		plugin.destroy?.();
		expect(onDropOff).toHaveBeenCalledWith("a", 250);
	});

	it("does NOT fire onDropOff on destroy after completion", () => {
		const clock = makeClock();
		const onDropOff = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onDropOff });
		plugin.onInit?.(machineView("a"));
		plugin.onComplete?.({ value: 1 });
		clock.advance(1000);
		plugin.destroy?.();
		expect(onDropOff).not.toHaveBeenCalled();
	});

	it("getReport folds in the live open-visit duration and reports a live totalDuration", () => {
		const clock = makeClock();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now });
		plugin.onInit?.(machineView("a"));
		clock.advance(150);
		const report = plugin.getReport();
		expect(report.stepTimings.a).toBe(150);
		expect(report.totalDuration).toBe(150);
		expect(report.currentStep).toBe("a");
		expect(report.completed).toBe(false);
	});

	it("resets counters, timings, and completed state on onReset, restoring the initial step timer", () => {
		const clock = makeClock();
		const onDropOff = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onDropOff });
		plugin.onInit?.(machineView("a"));
		clock.advance(100);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		clock.advance(50);
		plugin.afterTransition?.(
			ev({ type: "previous", fromStepId: "b", toStepId: "a" }),
		);
		plugin.onComplete?.({ value: 1 });

		clock.advance(10);
		plugin.onReset?.();
		const report = plugin.getReport();
		expect(report.backtrackCount).toBe(0);
		expect(report.backtrackHistory).toEqual([]);
		// stepTimings folds in the freshly-reopened step's live visit (0ms elapsed so far)
		expect(report.stepTimings).toEqual({ a: 0 });
		expect(report.completed).toBe(false);
		expect(report.currentStep).toBe("a");
		expect(report.startedAt).toBe(clock.now());

		// a subsequent destroy fires onDropOff again for the fresh session
		clock.advance(75);
		plugin.destroy?.();
		expect(onDropOff).toHaveBeenCalledWith("a", 75);
	});

	it("is robust to a throwing user callback — internal state stays consistent", () => {
		const clock = makeClock();
		const plugin = createAnalyticsPlugin<D>({
			now: clock.now,
			onStepComplete: () => {
				throw new Error("boom");
			},
		});
		plugin.onInit?.(machineView("a"));
		clock.advance(100);
		expect(() =>
			plugin.afterTransition?.(
				ev({ type: "next", fromStepId: "a", toStepId: "b" }),
			),
		).toThrow("boom");
		// state was mutated BEFORE the throwing callback ran
		const report = plugin.getReport();
		expect(report.stepTimings.a).toBe(100);
		expect(report.currentStep).toBe("b");
	});

	it("uses a default clock (Date.now) producing non-negative durations", () => {
		const plugin = createAnalyticsPlugin<D>();
		plugin.onInit?.(machineView("a"));
		const report = plugin.getReport();
		expect(report.totalDuration).toBeGreaterThanOrEqual(0);
	});

	it("onInit is idempotent: a second onInit fully clears timings/backtracks/viewedSteps", () => {
		const clock = makeClock();
		const onBacktrack = vi.fn();
		const plugin = createAnalyticsPlugin<D>({ now: clock.now, onBacktrack });

		// ── first (discarded probe) session: init at "a", walk a->b->a ──
		plugin.onInit?.(machineView("a"));
		clock.advance(100);
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);
		clock.advance(50);
		plugin.afterTransition?.(
			ev({ type: "previous", fromStepId: "b", toStepId: "a" }),
		);
		expect(plugin.getReport().backtrackCount).toBe(1);
		plugin.destroy?.(); // StrictMode discards the probe

		// ── second (real) session on the SAME instance: re-init at "a" ──
		onBacktrack.mockClear();
		plugin.onInit?.(machineView("a"));
		const report = plugin.getReport();
		// fully re-seeded: no residue from the probe session
		expect(report.backtrackCount).toBe(0);
		expect(report.backtrackHistory).toEqual([]);
		expect(report.stepTimings).toEqual({ a: 0 }); // only the freshly reopened live visit
		expect(report.currentStep).toBe("a");
		expect(report.completed).toBe(false);

		// a forward goTo to a step that was viewed ONLY in the probe session must NOT
		// be misclassified as a backtrack (proves viewedSteps was cleared):
		plugin.afterTransition?.(
			ev({ type: "goTo", fromStepId: "a", toStepId: "b" }),
		);
		expect(onBacktrack).not.toHaveBeenCalled();
		expect(plugin.getReport().backtrackCount).toBe(0);
	});

	it("absorbs an in-flight afterTransition when added mid-transition (no double view / phantom complete)", () => {
		const clock = makeClock();
		const onStepView = vi.fn();
		const onStepComplete = vi.fn();
		const onBacktrack = vi.fn();
		const plugin = createAnalyticsPlugin<D>({
			now: clock.now,
			onStepView,
			onStepComplete,
			onBacktrack,
		});

		// use() ran mid-transition: state already committed to "b", so onInit seeds "b".
		plugin.onInit?.(machineView("b"));
		expect(onStepView).toHaveBeenCalledTimes(1);
		expect(onStepView).toHaveBeenCalledWith("b", { value: 1 });

		clock.advance(30);
		// the in-flight transition's afterTransition finally arrives: a -> b.
		plugin.afterTransition?.(
			ev({ type: "next", fromStepId: "a", toStepId: "b" }),
		);

		// absorbed: NO second onStepView("b"), NO phantom onStepComplete, NO backtrack.
		expect(onStepView).toHaveBeenCalledTimes(1);
		expect(onStepComplete).not.toHaveBeenCalled();
		expect(onBacktrack).not.toHaveBeenCalled();

		// "a" is now recorded as previously visited, so a later goTo back to "a" is a backtrack,
		// and "b"'s live timer keeps running from onInit (not reset by the absorbed event).
		const report = plugin.getReport();
		expect(report.currentStep).toBe("b");
		expect(report.stepTimings.b).toBe(30); // continuous since onInit, no bogus close

		clock.advance(10);
		plugin.afterTransition?.(
			ev({ type: "goTo", fromStepId: "b", toStepId: "a" }),
		);
		expect(onBacktrack).toHaveBeenCalledWith("b", "a"); // "a" was marked viewed by the absorb
		expect(plugin.getReport().backtrackCount).toBe(1);
	});
});
