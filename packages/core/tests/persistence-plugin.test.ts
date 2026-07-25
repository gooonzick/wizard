import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardRestoreError } from "../src/errors";
import type { WizardSerializedState } from "../src/machine/wizard-machine";
import type {
	PersistedWizardSnapshot,
	PersistencePlugin,
} from "../src/plugins/persistence";
import { createPersistencePlugin } from "../src/plugins/persistence";
import type {
	TransitionEvent,
	WizardMachineReadonly,
} from "../src/plugins/types";

interface D extends Record<string, unknown> {
	value: number;
}

const makeState = (
	over: Partial<WizardSerializedState<D>> = {},
): WizardSerializedState<D> => ({
	version: 1,
	currentStepId: "b",
	data: { value: 1 },
	isValid: true,
	isCompleted: false,
	stepStatuses: { a: "completed", b: "active" },
	visitedSteps: ["a", "b"],
	history: ["a", "b"],
	...over,
});

const makeEnvelope = (
	over: Partial<PersistedWizardSnapshot<D>> = {},
): PersistedWizardSnapshot<D> => ({
	envelope: 1,
	version: 1,
	savedAt: Date.now(),
	state: makeState(),
	...over,
});

/** Fake facade exposing the full (optional) WIZ-006 member set. */
const makeView = () => ({
	snapshot: { currentStepId: "a", data: { value: 1 } } as never,
	currentStep: { id: "a" } as never,
	getStepStatus: () => "active" as const,
	isBusy: false,
	serialize: vi.fn((): WizardSerializedState<D> => makeState()),
	restore: vi.fn((_state: WizardSerializedState<D>): void => {}),
});

/** The pre-WIZ-006 three-member facade literal (backward-compat harness). */
const makeLegacyView = (): WizardMachineReadonly<D> => ({
	snapshot: { currentStepId: "a", data: { value: 1 } } as never,
	currentStep: { id: "a" } as never,
	getStepStatus: () => "active" as const,
});

const makeAdapter = (initial: PersistedWizardSnapshot<D> | null = null) => {
	const saved: PersistedWizardSnapshot<D>[] = [];
	return {
		saved,
		load: vi.fn((): PersistedWizardSnapshot<D> | null => initial),
		save: vi.fn((snapshot: PersistedWizardSnapshot<D>): void => {
			saved.push(snapshot);
		}),
		clear: vi.fn((): void => {}),
	};
};

const deferredAdapter = () => {
	let resolveLoad!: (v: PersistedWizardSnapshot<D> | null) => void;
	let rejectLoad!: (e: unknown) => void;
	const pending = new Promise<PersistedWizardSnapshot<D> | null>((res, rej) => {
		resolveLoad = res;
		rejectLoad = rej;
	});
	return {
		load: vi.fn(() => pending),
		save: vi.fn((_snapshot: PersistedWizardSnapshot<D>): void => {}),
		clear: vi.fn((): void => {}),
		resolveLoad,
		rejectLoad,
	};
};

const ev = (over: Partial<TransitionEvent<D>> = {}): TransitionEvent<D> => ({
	type: "next",
	fromStepId: "a",
	toStepId: "b",
	data: { value: 1 },
	timestamp: 0,
	...over,
});

const dataChange = (p: PersistencePlugin<D>): void => {
	p.onDataChange?.({ value: 1 }, { value: 2 }, ["value"]);
};

/** Drains queued microtasks (the write queue always hops at least one). */
const micro = async (): Promise<void> => {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

/** Advances fake timers AND drains the write queue's microtask hops. */
const tick = async (ms = 0): Promise<void> => {
	await vi.advanceTimersByTimeAsync(ms);
	await micro();
};

describe("createPersistencePlugin", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// ── naming ───────────────────────────────────────────────────────
	it("defaults the plugin name to 'persistence' and honours an override", () => {
		expect(createPersistencePlugin<D>({ adapter: makeAdapter() }).name).toBe(
			"persistence",
		);
		expect(
			createPersistencePlugin<D>({ adapter: makeAdapter(), name: "p2" }).name,
		).toBe("p2");
	});

	// ── restore paths ────────────────────────────────────────────────
	it("skips the load entirely when restoreOnInit is false", async () => {
		const adapter = makeAdapter(makeEnvelope());
		const plugin = createPersistencePlugin<D>({
			adapter,
			restoreOnInit: false,
		});
		const view = makeView();
		plugin.onInit?.(view);
		expect(adapter.load).not.toHaveBeenCalled();
		expect(view.restore).not.toHaveBeenCalled();
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "disabled",
		});
	});

	it("skips with reason 'empty' when the store holds nothing", async () => {
		const adapter = makeAdapter(null);
		const onRestoreSkipped = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestoreSkipped });
		const view = makeView();
		plugin.onInit?.(view);
		expect(view.restore).not.toHaveBeenCalled();
		expect(onRestoreSkipped).toHaveBeenCalledWith("empty");
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "empty",
		});
	});

	it("applies a valid snapshot synchronously inside onInit (sync adapter)", async () => {
		const env = makeEnvelope();
		const adapter = makeAdapter(env);
		const onRestored = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestored });
		const view = makeView();

		plugin.onInit?.(view);

		// asserted BEFORE any await: the restore already happened
		expect(view.restore).toHaveBeenCalledTimes(1);
		expect(view.restore).toHaveBeenCalledWith(env.state);
		expect(onRestored).toHaveBeenCalledWith(env.state);
		await expect(plugin.ready).resolves.toEqual({
			status: "restored",
			state: env.state,
		});
	});

	it.each([
		["empty object", {} as PersistedWizardSnapshot<D>],
		["wrong envelope version", makeEnvelope({ envelope: 2 as 1 })],
		[
			"missing state",
			makeEnvelope({ state: undefined as unknown as WizardSerializedState<D> }),
		],
		[
			"null state",
			makeEnvelope({ state: null as unknown as WizardSerializedState<D> }),
		],
	])("rejects a malformed envelope (%s)", async (_label, bad) => {
		const adapter = makeAdapter(bad);
		const onRestoreError = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestoreError });
		const view = makeView();

		plugin.onInit?.(view);
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		expect(onRestoreError).toHaveBeenCalledTimes(1);
		expect(onRestoreError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		await expect(plugin.ready).resolves.toMatchObject({ status: "failed" });
	});

	it("discards and clears a record written by a different app version", async () => {
		const adapter = makeAdapter(makeEnvelope({ version: 1 }));
		const plugin = createPersistencePlugin<D>({ adapter, version: 2 });
		const view = makeView();

		plugin.onInit?.(view);
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "version-mismatch",
		});
	});

	it("discards and clears a snapshot older than maxAgeMs", async () => {
		const adapter = makeAdapter(makeEnvelope({ savedAt: Date.now() - 10_000 }));
		const plugin = createPersistencePlugin<D>({ adapter, maxAgeMs: 1_000 });
		const view = makeView();

		plugin.onInit?.(view);
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "expired",
		});
	});

	it("restores a snapshot that is still within maxAgeMs", async () => {
		const adapter = makeAdapter(makeEnvelope({ savedAt: Date.now() - 100 }));
		const plugin = createPersistencePlugin<D>({ adapter, maxAgeMs: 1_000 });
		const view = makeView();

		plugin.onInit?.(view);

		expect(view.restore).toHaveBeenCalledTimes(1);
		expect(adapter.clear).not.toHaveBeenCalled();
	});

	it("refuses a completed snapshot by default and clears it", async () => {
		const adapter = makeAdapter(
			makeEnvelope({ state: makeState({ isCompleted: true }) }),
		);
		const plugin = createPersistencePlugin<D>({ adapter });
		const view = makeView();

		plugin.onInit?.(view);
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "completed",
		});
	});

	it("restores a completed snapshot when clearOnComplete is false", () => {
		const state = makeState({ isCompleted: true });
		const adapter = makeAdapter(makeEnvelope({ state }));
		const plugin = createPersistencePlugin<D>({
			adapter,
			clearOnComplete: false,
		});
		const view = makeView();

		plugin.onInit?.(view);

		expect(view.restore).toHaveBeenCalledWith(state);
		expect(adapter.clear).not.toHaveBeenCalled();
	});

	it("swallows a WizardRestoreError thrown by machine.restore", async () => {
		const boom = new WizardRestoreError("unknown step");
		const adapter = makeAdapter(makeEnvelope());
		const onRestoreError = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestoreError });
		const view = makeView();
		view.restore.mockImplementation(() => {
			throw boom;
		});

		expect(() => plugin.onInit?.(view)).not.toThrow();
		await tick();

		expect(onRestoreError).toHaveBeenCalledWith(boom, expect.anything());
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		await expect(plugin.ready).resolves.toEqual({
			status: "failed",
			error: boom,
		});
	});

	it("swallows a synchronous adapter.load throw", async () => {
		const boom = new Error("storage exploded");
		const adapter = makeAdapter();
		adapter.load.mockImplementation(() => {
			throw boom;
		});
		const onRestoreError = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestoreError });

		expect(() => plugin.onInit?.(makeView())).not.toThrow();

		expect(onRestoreError).toHaveBeenCalledWith(boom, undefined);
		await expect(plugin.ready).resolves.toEqual({
			status: "failed",
			error: boom,
		});
	});

	it("goes inert against a legacy facade with no serialize/restore", async () => {
		const adapter = makeAdapter(makeEnvelope());
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 10 });

		plugin.onInit?.(makeLegacyView());
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "unsupported",
		});
		expect(adapter.load).not.toHaveBeenCalled();

		dataChange(plugin);
		plugin.afterTransition?.(ev());
		await tick(1_000);
		expect(adapter.save).not.toHaveBeenCalled();
	});

	// ── debounce ─────────────────────────────────────────────────────
	it("coalesces rapid data changes into exactly one trailing-edge write", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await tick(100);
		dataChange(plugin);
		await tick(100);
		dataChange(plugin);
		expect(adapter.save).not.toHaveBeenCalled();

		await tick(299);
		expect(adapter.save).not.toHaveBeenCalled();
		await tick(1);
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("writes on the next microtask when debounceMs is 0", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 0 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await micro();
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("afterTransition writes immediately and absorbs a pending debounced write", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		plugin.afterTransition?.(ev());
		await micro();
		expect(adapter.save).toHaveBeenCalledTimes(1);

		await tick(1_000);
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("saveOnTransition:false and saveOnDataChange:false suppress only their own trigger", async () => {
		const a1 = makeAdapter();
		const p1 = createPersistencePlugin<D>({
			adapter: a1,
			saveOnTransition: false,
			debounceMs: 0,
		});
		p1.onInit?.(makeView());
		p1.afterTransition?.(ev());
		await micro();
		expect(a1.save).not.toHaveBeenCalled();
		dataChange(p1);
		await micro();
		expect(a1.save).toHaveBeenCalledTimes(1);

		const a2 = makeAdapter();
		const p2 = createPersistencePlugin<D>({
			adapter: a2,
			saveOnDataChange: false,
			debounceMs: 0,
		});
		p2.onInit?.(makeView());
		dataChange(p2);
		await micro();
		expect(a2.save).not.toHaveBeenCalled();
		p2.afterTransition?.(ev());
		await micro();
		expect(a2.save).toHaveBeenCalledTimes(1);
	});

	it("builds the payload at flush time, not at schedule time", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		const view = makeView();
		let n = 0;
		view.serialize.mockImplementation(() => {
			n += 1;
			return makeState({ data: { value: n } });
		});
		plugin.onInit?.(view);

		dataChange(plugin);
		expect(view.serialize).not.toHaveBeenCalled(); // nothing serialized yet
		dataChange(plugin);

		await tick(300);
		expect(view.serialize).toHaveBeenCalledTimes(1);
		expect(adapter.saved).toHaveLength(1);
		expect(adapter.saved[0].state.data).toEqual({ value: 1 });
	});

	// ── complete / reset ─────────────────────────────────────────────
	it("clears on complete, then ignores later saves until the next reset", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 0 });
		plugin.onInit?.(makeView());

		plugin.onComplete?.({ value: 1 });
		await micro();
		expect(adapter.clear).toHaveBeenCalledTimes(1);
		expect(adapter.save).not.toHaveBeenCalled();

		dataChange(plugin);
		await tick(1_000);
		expect(adapter.save).not.toHaveBeenCalled(); // inert

		plugin.onReset?.();
		await micro();
		expect(adapter.clear).toHaveBeenCalledTimes(2);
		dataChange(plugin);
		await micro();
		expect(adapter.save).toHaveBeenCalledTimes(1); // re-armed
	});

	it("saves instead of clearing on complete when clearOnComplete is false", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({
			adapter,
			clearOnComplete: false,
		});
		plugin.onInit?.(makeView());

		plugin.onComplete?.({ value: 1 });
		await micro();
		expect(adapter.save).toHaveBeenCalledTimes(1);
		expect(adapter.clear).not.toHaveBeenCalled();
	});

	it("drops a pending debounced write on reset (the pre-reset payload never lands)", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		plugin.onReset?.();
		await tick(1_000);

		expect(adapter.save).not.toHaveBeenCalled();
		expect(adapter.clear).toHaveBeenCalledTimes(1);
	});

	it("saves instead of clearing on reset when clearOnReset is false", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({
			adapter,
			clearOnReset: false,
			debounceMs: 300,
		});
		plugin.onInit?.(makeView());

		dataChange(plugin);
		plugin.onReset?.();
		await tick(1_000);

		expect(adapter.save).toHaveBeenCalledTimes(1);
		expect(adapter.clear).not.toHaveBeenCalled();
	});

	// ── destroy ──────────────────────────────────────────────────────
	it("flushes a pending write on destroy and cancels the timer", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await plugin.destroy?.();
		expect(adapter.save).toHaveBeenCalledTimes(1);

		await tick(1_000);
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("writes nothing on destroy when no write is pending", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		plugin.onInit?.(makeView());

		await plugin.destroy?.();
		await tick(1_000);

		expect(adapter.save).not.toHaveBeenCalled();
		expect(adapter.clear).not.toHaveBeenCalled();
	});

	it("settles a still-pending ready on destroy", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		plugin.onInit?.(makeView());

		await plugin.destroy?.();

		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "destroyed",
		});
	});

	// ── beforeSave ───────────────────────────────────────────────────
	it("honours beforeSave: null skips, a replacement is written, a throw is reported", async () => {
		const a1 = makeAdapter();
		const p1 = createPersistencePlugin<D>({
			adapter: a1,
			debounceMs: 0,
			beforeSave: () => null,
		});
		p1.onInit?.(makeView());
		dataChange(p1);
		await micro();
		expect(a1.save).not.toHaveBeenCalled();

		const redacted = makeState({ data: { value: 999 } });
		const a2 = makeAdapter();
		const p2 = createPersistencePlugin<D>({
			adapter: a2,
			debounceMs: 0,
			beforeSave: () => redacted,
		});
		p2.onInit?.(makeView());
		dataChange(p2);
		await micro();
		expect(a2.saved[0].state).toBe(redacted);

		const boom = new Error("redaction failed");
		const onSaveError = vi.fn();
		const a3 = makeAdapter();
		const p3 = createPersistencePlugin<D>({
			adapter: a3,
			debounceMs: 0,
			onSaveError,
			beforeSave: () => {
				throw boom;
			},
		});
		p3.onInit?.(makeView());
		dataChange(p3);
		await micro();
		expect(a3.save).not.toHaveBeenCalled();
		expect(onSaveError).toHaveBeenCalledWith(boom);
	});

	// ── save failures ────────────────────────────────────────────────
	it("reports a rejecting save and keeps the queue usable", async () => {
		const boom = new Error("quota exceeded");
		const adapter = makeAdapter();
		adapter.save.mockRejectedValueOnce(boom as never);
		const onSaveError = vi.fn();
		const plugin = createPersistencePlugin<D>({
			adapter,
			debounceMs: 0,
			onSaveError,
		});
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await expect(plugin.flush()).resolves.toBeUndefined();
		expect(onSaveError).toHaveBeenCalledWith(boom);

		dataChange(plugin);
		await expect(plugin.flush()).resolves.toBeUndefined();
		expect(adapter.save).toHaveBeenCalledTimes(2);
		expect(onSaveError).toHaveBeenCalledTimes(1);
	});

	it("warns at most once per category when no error callback is supplied", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const adapter = makeAdapter();
		adapter.save.mockImplementation(() => {
			throw new Error("nope");
		});
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 0 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await plugin.flush();
		dataChange(plugin);
		await plugin.flush();

		expect(adapter.save).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	// ── envelope ─────────────────────────────────────────────────────
	it("writes the documented envelope shape", async () => {
		vi.setSystemTime(new Date(1_700_000_000_000));
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({
			adapter,
			debounceMs: 0,
			version: 7,
		});
		const view = makeView();
		plugin.onInit?.(view);

		dataChange(plugin);
		await micro();

		expect(adapter.saved[0]).toEqual({
			envelope: 1,
			version: 7,
			savedAt: 1_700_000_000_000,
			state: makeState(),
		});
	});

	// ── async adapter races ──────────────────────────────────────────
	it("discards an async restore that lands after a transition", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		const view = makeView();
		plugin.onInit?.(view);

		plugin.afterTransition?.(ev());
		adapter.resolveLoad(makeEnvelope());
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "stale",
		});
	});

	it("discards an async restore that lands while the machine is busy", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		const view = makeView();
		plugin.onInit?.(view);

		view.isBusy = true;
		adapter.resolveLoad(makeEnvelope());
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "stale",
		});
	});

	it("discards an async restore that lands after destroy", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		const view = makeView();
		plugin.onInit?.(view);

		await plugin.destroy?.();
		adapter.resolveLoad(makeEnvelope());
		await tick();

		expect(view.restore).not.toHaveBeenCalled();
		await expect(plugin.ready).resolves.toEqual({
			status: "skipped",
			reason: "destroyed",
		});
	});

	it("ignores a superseded async restore after a StrictMode re-init", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter });
		const first = makeView();
		const second = makeView();

		plugin.onInit?.(first);
		plugin.onInit?.(second); // new machine, same plugin instance
		adapter.resolveLoad(makeEnvelope());
		await tick();

		expect(first.restore).not.toHaveBeenCalled();
		expect(second.restore).toHaveBeenCalledTimes(1);
	});

	it("suppresses writes while an async load is in flight and drains after it settles", async () => {
		const adapter = deferredAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 10 });
		const view = makeView();
		plugin.onInit?.(view);

		dataChange(plugin);
		await tick(1_000);
		expect(adapter.save).not.toHaveBeenCalled(); // suppressed during the restore window

		adapter.resolveLoad(makeEnvelope());
		await tick();
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("reports a rejected async load and never rejects `ready`", async () => {
		const boom = new Error("network down");
		const adapter = deferredAdapter();
		const onRestoreError = vi.fn();
		const plugin = createPersistencePlugin<D>({ adapter, onRestoreError });
		plugin.onInit?.(makeView());

		adapter.rejectLoad(boom);
		await tick();

		expect(onRestoreError).toHaveBeenCalledWith(boom, undefined);
		await expect(plugin.ready).resolves.toEqual({
			status: "failed",
			error: boom,
		});
	});

	// ── imperative controls ──────────────────────────────────────────
	it("flush() drains a pending debounced write without advancing timers", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 5_000 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await plugin.flush();
		expect(adapter.save).toHaveBeenCalledTimes(1);

		await tick(10_000);
		expect(adapter.save).toHaveBeenCalledTimes(1);
	});

	it("clear() cancels a pending save and clears the record once", async () => {
		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({ adapter, debounceMs: 300 });
		plugin.onInit?.(makeView());

		dataChange(plugin);
		await plugin.clear();

		expect(adapter.clear).toHaveBeenCalledTimes(1);
		expect(adapter.save).not.toHaveBeenCalled();
		await tick(1_000);
		expect(adapter.save).not.toHaveBeenCalled();
	});

	it("beforeTransition never vetoes", () => {
		const plugin = createPersistencePlugin<D>({ adapter: makeAdapter() });
		expect(plugin.beforeTransition?.(ev())).toBeUndefined();
	});

	// ── unload listener ──────────────────────────────────────────────
	it("registers a flushing pagehide listener only when flushOnUnload is on", async () => {
		const listeners = new Map<string, () => void>();
		const addEventListener = vi.fn((type: string, handler: () => void) => {
			listeners.set(type, handler);
		});
		const removeEventListener = vi.fn((type: string) => {
			listeners.delete(type);
		});
		vi.stubGlobal("addEventListener", addEventListener);
		vi.stubGlobal("removeEventListener", removeEventListener);

		const off = createPersistencePlugin<D>({ adapter: makeAdapter() });
		off.onInit?.(makeView());
		expect(addEventListener).not.toHaveBeenCalled();

		const adapter = makeAdapter();
		const plugin = createPersistencePlugin<D>({
			adapter,
			debounceMs: 5_000,
			flushOnUnload: true,
		});
		plugin.onInit?.(makeView());
		expect(addEventListener).toHaveBeenCalledTimes(1);
		expect(addEventListener.mock.calls[0][0]).toBe("pagehide");

		dataChange(plugin);
		listeners.get("pagehide")?.();
		await micro();
		expect(adapter.save).toHaveBeenCalledTimes(1);

		// re-init keeps exactly ONE live listener (previous one removed first)
		plugin.onInit?.(makeView());
		expect(
			addEventListener.mock.calls.length -
				removeEventListener.mock.calls.length,
		).toBe(1);
		expect(listeners.size).toBe(1);

		plugin.destroy?.();
		expect(listeners.size).toBe(0);
	});
});
