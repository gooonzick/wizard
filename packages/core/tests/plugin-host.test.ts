import { describe, expect, it, vi } from "vitest";
import { WizardConfigurationError } from "../src/errors";
import { PluginHost } from "../src/plugins/plugin-host";
import type { TransitionEvent } from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const ev = (over: Partial<TransitionEvent<D>> = {}): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
	...over,
});

const makeHost = () => {
	const reported: unknown[] = [];
	const host = new PluginHost<D>((err) => {
		reported.push(err);
	});
	return { host, reported };
};

describe("PluginHost", () => {
	it("registers plugins and lists them in registration order", () => {
		const { host } = makeHost();
		host.add({ name: "a" });
		host.add({ name: "b" });
		expect(host.list().map((p) => p.name)).toEqual(["a", "b"]);
	});

	it("throws WizardConfigurationError on duplicate name", () => {
		const { host } = makeHost();
		host.add({ name: "dup" });
		expect(() => host.add({ name: "dup" })).toThrow(WizardConfigurationError);
	});

	it("remove calls destroy and drops the plugin", async () => {
		const { host } = makeHost();
		const destroy = vi.fn();
		host.add({ name: "a", destroy });
		await host.remove("a");
		expect(destroy).toHaveBeenCalledTimes(1);
		expect(host.list()).toHaveLength(0);
	});

	it("dispatchBeforeTransition awaits sequentially and returns false on veto", async () => {
		const { host } = makeHost();
		const order: string[] = [];
		host.add({
			name: "a",
			beforeTransition: async () => {
				order.push("a");
			},
		});
		host.add({
			name: "veto",
			beforeTransition: () => {
				order.push("veto");
				return false;
			},
		});
		host.add({
			name: "never",
			beforeTransition: () => {
				order.push("never");
			},
		});
		const ok = await host.dispatchBeforeTransition(ev());
		expect(ok).toBe(false);
		expect(order).toEqual(["a", "veto"]); // stops at veto
	});

	it("dispatchBeforeTransition propagates a thrown error to the caller", async () => {
		const { host } = makeHost();
		const boom = new Error("boom");
		host.add({
			name: "a",
			beforeTransition: () => {
				throw boom;
			},
		});
		await expect(host.dispatchBeforeTransition(ev())).rejects.toBe(boom);
	});

	it("dispatchAfterTransition isolates throws and reports them, continuing", async () => {
		const { host, reported } = makeHost();
		const second = vi.fn();
		host.add({
			name: "a",
			afterTransition: () => {
				throw new Error("after-fail");
			},
		});
		host.add({ name: "b", afterTransition: second });
		await host.dispatchAfterTransition(ev());
		expect(second).toHaveBeenCalledTimes(1);
		expect(reported).toHaveLength(1);
	});

	it("dispatchError isolates onError throws (no recursion) via console.error", async () => {
		const { host, reported } = makeHost();
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		host.add({
			name: "a",
			onError: () => {
				throw new Error("inside-onError");
			},
		});
		await host.dispatchError(new Error("orig"), {
			stepId: "a",
			phase: "transition",
			data: { value: 1 },
		});
		expect(reported).toHaveLength(0); // NOT re-reported (no recursion)
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("destroyAll runs in reverse registration order, isolated", async () => {
		const { host } = makeHost();
		const order: string[] = [];
		host.add({ name: "a", destroy: () => void order.push("a") });
		host.add({
			name: "b",
			destroy: () => {
				order.push("b");
				throw new Error("b-fail");
			},
		});
		host.add({ name: "c", destroy: () => void order.push("c") });
		await host.destroyAll();
		expect(order).toEqual(["c", "b", "a"]);
		expect(host.list()).toHaveLength(0);
	});

	it("dispatchInit is fire-and-forget and routes rejections to onError", async () => {
		const { host, reported } = makeHost();
		host.add({
			name: "a",
			onInit: async () => {
				throw new Error("init-fail");
			},
		});
		host.dispatchInit({
			snapshot: {} as never,
			currentStep: {} as never,
			getStepStatus: () => "active",
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(reported).toHaveLength(1);
	});
});
