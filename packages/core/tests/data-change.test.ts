import { describe, expect, it, vi } from "vitest";
import { WizardMachine } from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

function makeMachine(
	events?: ConstructorParameters<typeof WizardMachine<SimpleData>>[3],
	plugins?: WizardPlugin<SimpleData>[],
): WizardMachine<SimpleData> {
	return new WizardMachine<SimpleData>(
		createSimpleLinearDefinition(),
		{},
		initial,
		events,
		plugins,
	);
}

describe("onDataChange — updateField", () => {
	it("fires onDataChange(prev, next, [field]) exactly once", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.updateField("name", "b");
		expect(onDataChange).toHaveBeenCalledTimes(1);
		const [prev, next, changedFields] = onDataChange.mock.calls[0];
		expect(prev.name).toBe("a");
		expect(next.name).toBe("b");
		expect(changedFields).toEqual(["name"]);
	});

	it("passes distinct prev/next objects reflecting old and new values", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.updateField("email", "b@x.io");
		const [prev, next] = onDataChange.mock.calls[0];
		expect(prev).not.toBe(next);
		expect(prev.email).toBe("a@x.io");
		expect(next.email).toBe("b@x.io");
	});
});

describe("onDataChange — updateData shallow diff", () => {
	it("reports every changed top-level key", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.updateData((d) => ({ ...d, name: "x", email: "y@z.io" }));
		expect(onDataChange).toHaveBeenCalledTimes(1);
		const changedFields = onDataChange.mock.calls[0][2] as (keyof SimpleData)[];
		expect(changedFields).toHaveLength(2);
		expect(changedFields).toEqual(expect.arrayContaining(["name", "email"]));
	});

	it("reports only the single changed key", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.updateData((d) => ({ ...d, name: "x" }));
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});

	it("diffs correctly for an in-place-mutating updater (prev snapshot captured first)", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.updateData((d) => {
			d.name = "x";
			return d;
		});
		expect(onDataChange).toHaveBeenCalledTimes(1);
		const [prev, , changedFields] = onDataChange.mock.calls[0];
		expect(changedFields).toEqual(["name"]);
		expect(prev.name).toBe("a");
	});
});

describe("onDataChange — setData shallow diff", () => {
	it("reports only the changed key", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.setData({ name: "x", email: initial.email });
		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
	});
});

describe("onDataChange — no-op updates fire nothing", () => {
	it("updateField to the current value fires nothing (not even onStateChange)", () => {
		const onDataChange = vi.fn();
		const onStateChange = vi.fn();
		const watcher = vi.fn();
		const plugin = vi.fn();
		const m = makeMachine({ onDataChange, onStateChange }, [
			{ name: "p", onDataChange: plugin },
		]);
		m.watchField("name", watcher);
		onStateChange.mockClear();
		m.updateField("name", initial.name);
		expect(onDataChange).not.toHaveBeenCalled();
		expect(watcher).not.toHaveBeenCalled();
		expect(plugin).not.toHaveBeenCalled();
		expect(onStateChange).not.toHaveBeenCalled();
	});

	it("updateData returning a new object with identical values fires onStateChange but not onDataChange", () => {
		const onDataChange = vi.fn();
		const onStateChange = vi.fn();
		const m = makeMachine({ onDataChange, onStateChange });
		onStateChange.mockClear();
		m.updateData((d) => ({ ...d }));
		expect(onStateChange).toHaveBeenCalledTimes(1);
		expect(onDataChange).not.toHaveBeenCalled();
	});

	it("setData with identical values does not fire onDataChange", () => {
		const onDataChange = vi.fn();
		const m = makeMachine({ onDataChange });
		m.setData({ ...initial });
		expect(onDataChange).not.toHaveBeenCalled();
	});
});

describe("watchField", () => {
	it("fires cb(newValue, oldValue) for the watched field", () => {
		const cb = vi.fn();
		const m = makeMachine();
		m.watchField("name", cb);
		m.updateField("name", "x");
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith("x", "a");
	});

	it("does not fire when a different field changes", () => {
		const cb = vi.fn();
		const m = makeMachine();
		m.watchField("name", cb);
		m.updateField("email", "b@x.io");
		expect(cb).not.toHaveBeenCalled();
	});

	it("fires from updateData when the watched field changes", () => {
		const cb = vi.fn();
		const m = makeMachine();
		m.watchField("name", cb);
		m.updateData((d) => ({ ...d, name: "x" }));
		expect(cb).toHaveBeenCalledWith("x", "a");
	});

	it("fires both watchers registered on the same field", () => {
		const cb1 = vi.fn();
		const cb2 = vi.fn();
		const m = makeMachine();
		m.watchField("name", cb1);
		m.watchField("name", cb2);
		m.updateField("name", "x");
		expect(cb1).toHaveBeenCalledTimes(1);
		expect(cb2).toHaveBeenCalledTimes(1);
	});

	it("unsubscribe removes the watcher; re-subscribing works; double-unsubscribe is safe", () => {
		const cb = vi.fn();
		const m = makeMachine();
		const unsubscribe = m.watchField("name", cb);
		unsubscribe();
		m.updateField("name", "x");
		expect(cb).not.toHaveBeenCalled();

		// Re-subscribe works.
		m.watchField("name", cb);
		m.updateField("name", "y");
		expect(cb).toHaveBeenCalledTimes(1);

		// Unsubscribing twice is safe (no throw).
		expect(() => {
			unsubscribe();
			unsubscribe();
		}).not.toThrow();
	});
});

describe("onDataChange — ordering", () => {
	it("fires onStateChange before onDataChange before the field watcher", () => {
		const order: string[] = [];
		const m = makeMachine({
			onStateChange: () => order.push("state"),
			onDataChange: () => order.push("data"),
		});
		m.watchField("name", () => order.push("watcher"));
		order.length = 0; // drop the construction-time onStateChange
		m.updateField("name", "x");
		expect(order).toEqual(["state", "data", "watcher"]);
	});
});

describe("onDataChange — error isolation", () => {
	it("a throwing onDataChange routes to onError, does not block the watcher, and does not throw", () => {
		const boom = new Error("event boom");
		const onError = vi.fn();
		const watcher = vi.fn();
		const m = makeMachine({
			onError,
			onDataChange: () => {
				throw boom;
			},
		});
		m.watchField("name", watcher);
		expect(() => m.updateField("name", "x")).not.toThrow();
		expect(onError).toHaveBeenCalledWith(boom);
		expect(watcher).toHaveBeenCalledTimes(1);
		expect(m.snapshot.data.name).toBe("x");
	});

	it("a throwing watcher routes to onError, does not block a second watcher, and does not throw", () => {
		const boom = new Error("watcher boom");
		const onError = vi.fn();
		const second = vi.fn();
		const m = makeMachine({ onError });
		m.watchField("name", () => {
			throw boom;
		});
		m.watchField("name", second);
		expect(() => m.updateField("name", "x")).not.toThrow();
		expect(onError).toHaveBeenCalledWith(boom);
		expect(second).toHaveBeenCalledTimes(1);
		expect(m.snapshot.data.name).toBe("x");
	});

	it("routes onDataChange throws with phase 'data' to plugin onError", async () => {
		const boom = new Error("event boom");
		const onError = vi.fn();
		const m = makeMachine(
			{
				onDataChange: () => {
					throw boom;
				},
			},
			[{ name: "p", onError }],
		);
		m.updateField("name", "x");
		await flush();
		expect(onError).toHaveBeenCalledTimes(1);
		const [err, ctx] = onError.mock.calls[0];
		expect(err).toBe(boom);
		expect(ctx).toMatchObject({ phase: "data" });
	});
});

describe("onDataChange — reset() / restore() silence", () => {
	it("reset() does not fire onDataChange / watchers / plugin onDataChange (still fires onReset)", async () => {
		const onDataChange = vi.fn();
		const onReset = vi.fn();
		const watcher = vi.fn();
		const pluginDataChange = vi.fn();
		const m = makeMachine({ onDataChange, onReset }, [
			{ name: "p", onDataChange: pluginDataChange },
		]);
		m.watchField("name", watcher);
		m.updateField("name", "changed");
		onDataChange.mockClear();
		watcher.mockClear();
		pluginDataChange.mockClear();

		m.reset();
		await flush();
		expect(onReset).toHaveBeenCalledTimes(1);
		expect(onDataChange).not.toHaveBeenCalled();
		expect(watcher).not.toHaveBeenCalled();
		expect(pluginDataChange).not.toHaveBeenCalled();
	});

	it("restore() does not fire onDataChange / watchers / plugin onDataChange", async () => {
		const onDataChange = vi.fn();
		const watcher = vi.fn();
		const pluginDataChange = vi.fn();
		const source = makeMachine();
		source.updateField("name", "restored");
		const serialized = source.serialize();

		const m = makeMachine({ onDataChange }, [
			{ name: "p", onDataChange: pluginDataChange },
		]);
		m.watchField("name", watcher);
		m.restore(serialized);
		await flush();
		expect(onDataChange).not.toHaveBeenCalled();
		expect(watcher).not.toHaveBeenCalled();
		expect(pluginDataChange).not.toHaveBeenCalled();
	});
});
