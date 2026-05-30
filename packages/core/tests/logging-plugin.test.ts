import { describe, expect, it, vi } from "vitest";
import { createLoggingPlugin } from "../src/plugins/logging";
import type { TransitionEvent } from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const fakeLogger = () => ({
	log: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
});

const ev = (): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
});

describe("createLoggingPlugin", () => {
	it("logs init/transition/complete/reset/destroy via the injected logger", async () => {
		const logger = fakeLogger();
		const plugin = createLoggingPlugin<D>({ logger });
		plugin.onInit?.({
			snapshot: { currentStepId: "a" } as never,
			currentStep: { id: "a" } as never,
			getStepStatus: () => "active",
		});
		await plugin.beforeTransition?.(ev());
		await plugin.afterTransition?.(ev());
		await plugin.onComplete?.({ value: 1 });
		await plugin.onReset?.();
		await plugin.destroy?.();
		// Default level "debug" → uses logger.debug for verbose lines.
		expect(logger.debug).toHaveBeenCalled();
		// afterTransition logs "from -> to"
		const messages = logger.debug.mock.calls.map((c) => String(c[0]));
		expect(messages.some((m) => m.includes("a") && m.includes("b"))).toBe(true);
	});

	it("never vetoes and never throws", async () => {
		const plugin = createLoggingPlugin<D>({ logger: fakeLogger() });
		const result = await plugin.beforeTransition?.(ev());
		expect(result).not.toBe(false); // does not veto
	});

	it("respects level: 'warn' uses logger.warn for errors, suppresses debug lines", async () => {
		const logger = fakeLogger();
		const plugin = createLoggingPlugin<D>({ level: "warn", logger });
		await plugin.beforeTransition?.(ev()); // debug-level line, suppressed at "warn"
		await plugin.onError?.(new Error("boom"), {
			stepId: "a",
			phase: "transition",
			data: { value: 1 },
		});
		expect(logger.debug).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalled();
	});

	it("defaults to console when no logger is provided", () => {
		const plugin = createLoggingPlugin<D>();
		expect(plugin.name).toBe("logging");
	});
});
