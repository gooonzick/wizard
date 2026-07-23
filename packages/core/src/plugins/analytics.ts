import type { StepId } from "../types/base";
import type {
	DeepReadonly,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";

/** One recorded backward navigation. */
export interface BacktrackEntry {
	from: StepId;
	to: StepId;
	at: number;
}

/** Aggregated analytics snapshot returned by `getReport()`. */
export interface AnalyticsReport {
	/** `now()` at session start (onInit, or first hook if onInit never ran, or last reset). */
	startedAt: number;
	/** Accumulated ms per step id, INCLUDING the current step's open visit so far. */
	stepTimings: Record<StepId, number>;
	/** Number of backward navigations recorded this session. */
	backtrackCount: number;
	/** Ordered list of backward navigations. */
	backtrackHistory: BacktrackEntry[];
	/** Most recently entered step, or null before any step is known. */
	currentStep: StepId | null;
	/** True once onWizardComplete has fired (reset clears it). */
	completed: boolean;
	/** completed ? completedAt - startedAt : now() - startedAt. */
	totalDuration: number;
}

/** Callbacks + injectable clock. All callbacks optional. */
export interface AnalyticsPluginConfig<TData> {
	onStepView?(stepId: StepId, data: DeepReadonly<TData>): void;
	onStepComplete?(stepId: StepId, durationMs: number): void;
	onWizardComplete?(data: DeepReadonly<TData>, totalDurationMs: number): void;
	/** Fired on destroy() only if the wizard was not completed. */
	onDropOff?(stepId: StepId, durationMs: number): void;
	onBacktrack?(fromStepId: StepId, toStepId: StepId): void;
	/** Injectable clock for testability. Defaults to Date.now. */
	now?: () => number;
}

/** A WizardPlugin augmented with a synchronous report getter. */
export type AnalyticsPlugin<TData> = WizardPlugin<TData> & {
	getReport(): AnalyticsReport;
};

/**
 * Built-in analytics collector. Auto-times each step, counts backtracks, records
 * drop-off on destroy, and fires user callbacks. Register with `machine.use(analytics)`
 * and read aggregates via `analytics.getReport()`.
 *
 * Timing uses `config.now` (default `Date.now`) — NOT `TransitionEvent.timestamp` — so
 * durations are injectable/deterministic in tests.
 */
export function createAnalyticsPlugin<TData>(
	config: AnalyticsPluginConfig<TData> = {},
): AnalyticsPlugin<TData> {
	const now = config.now ?? Date.now;

	// ── session state ──────────────────────────────────────────────
	let initialized = false;
	let startedAt = 0;
	let initialStepId: StepId | null = null; // captured in onInit, used by onReset
	let currentStepId: StepId | null = null; // most recently entered step
	let activeSince = 0; // now() when the current visit started
	let timerOpen = false; // is the current visit still accumulating?
	let completed = false;
	let completedAt: number | null = null;
	const stepTimings: Record<StepId, number> = {};
	const viewedSteps = new Set<StepId>(); // for goTo-backward detection
	let backtracks = 0;
	const backtrackHistory: BacktrackEntry[] = [];

	/** Lazily start a session if onInit never ran (defensive for direct-hook tests). */
	function ensureStarted(at: number): void {
		if (!initialized) {
			initialized = true;
			startedAt = at;
		}
	}

	/** Accumulate the open visit's elapsed time into stepTimings and mark it closed.
	 *  Returns the closed visit's duration, or null if no timer was open. */
	function closeTimer(at: number): number | null {
		if (!timerOpen || currentStepId === null) return null;
		const d = at - activeSince;
		stepTimings[currentStepId] = (stepTimings[currentStepId] ?? 0) + d;
		timerOpen = false;
		return d;
	}

	return {
		name: "analytics",

		onInit(machine: WizardMachineReadonly<TData>): void {
			const at = now();
			initialized = true;
			startedAt = at;
			completed = false;
			completedAt = null;
			const id = machine.snapshot.currentStepId;
			initialStepId = id;
			currentStepId = id;
			activeSince = at;
			timerOpen = true;
			viewedSteps.add(id);
			// internal state is fully consistent before the user callback:
			config.onStepView?.(id, machine.snapshot.data);
		},

		afterTransition(e: TransitionEvent<TData>): void {
			const at = now();
			ensureStarted(at);

			// 1. close the departing step's timer (currentStepId == e.fromStepId here)
			const closedId = timerOpen ? currentStepId : null;
			const closedDuration = closeTimer(at);

			// 2. backtrack detection (do BEFORE marking the target viewed)
			const isBacktrack =
				e.type === "previous" ||
				(e.type === "goTo" && viewedSteps.has(e.toStepId));
			if (isBacktrack) {
				backtracks += 1;
				backtrackHistory.push({ from: e.fromStepId, to: e.toStepId, at });
			}

			// 3. open the entered step's timer
			currentStepId = e.toStepId;
			activeSince = at;
			timerOpen = true;
			viewedSteps.add(e.toStepId);

			// 4. fire callbacks — state already consistent, a throw cannot corrupt it
			if (closedId !== null && closedDuration !== null) {
				config.onStepComplete?.(closedId, closedDuration);
			}
			if (isBacktrack) config.onBacktrack?.(e.fromStepId, e.toStepId);
			config.onStepView?.(e.toStepId, e.data);
		},

		onComplete(data: DeepReadonly<TData>): void {
			const at = now();
			ensureStarted(at);
			const closedId = timerOpen ? currentStepId : null;
			const closedDuration = closeTimer(at);
			completed = true;
			completedAt = at;
			const total = at - startedAt;
			if (closedId !== null && closedDuration !== null) {
				config.onStepComplete?.(closedId, closedDuration);
			}
			config.onWizardComplete?.(data, total);
		},

		onReset(): void {
			// Restart the analytics session in place. Reset provides no stepId/data, so we
			// restore the initial step (captured in onInit) and do NOT emit onStepView.
			const at = now();
			startedAt = at;
			initialized = true;
			completed = false;
			completedAt = null;
			backtracks = 0;
			backtrackHistory.length = 0;
			viewedSteps.clear();
			for (const k of Object.keys(stepTimings)) delete stepTimings[k];
			currentStepId = initialStepId;
			if (currentStepId !== null) {
				viewedSteps.add(currentStepId);
				activeSince = at;
				timerOpen = true;
			} else {
				timerOpen = false;
			}
		},

		destroy(): void {
			const at = now();
			ensureStarted(at);
			if (completed) return; // completed wizards never drop off
			if (currentStepId === null) return;
			const d = timerOpen ? at - activeSince : 0;
			if (timerOpen) {
				stepTimings[currentStepId] = (stepTimings[currentStepId] ?? 0) + d;
				timerOpen = false;
			}
			config.onDropOff?.(currentStepId, d);
		},

		getReport(): AnalyticsReport {
			const live: Record<StepId, number> = { ...stepTimings };
			if (timerOpen && currentStepId !== null) {
				live[currentStepId] =
					(live[currentStepId] ?? 0) + (now() - activeSince);
			}
			return {
				startedAt,
				stepTimings: live,
				backtrackCount: backtracks,
				backtrackHistory: backtrackHistory.map((b) => ({ ...b })),
				currentStep: currentStepId,
				completed,
				totalDuration: completed
					? (completedAt ?? startedAt) - startedAt
					: now() - startedAt,
			};
		},
	};
}
