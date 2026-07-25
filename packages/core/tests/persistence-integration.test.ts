import { describe, expect, it, vi } from "vitest";
import { WizardRestoreError } from "../src/errors";
import { WizardMachine } from "../src/machine/wizard-machine";
import { createAnalyticsPlugin } from "../src/plugins/analytics";
import { createLoggingPlugin } from "../src/plugins/logging";
import type { PersistedWizardSnapshot } from "../src/plugins/persistence";
import { createPersistencePlugin } from "../src/plugins/persistence";
import { createSimpleLinearDefinition, type SimpleData } from "./fixtures";

const flush = () => new Promise((r) => setTimeout(r, 0));
const initial: SimpleData = { name: "a", email: "a@x.io" };

/** Shared in-memory store so two machines can hand a record to each other. */
const memoryStore = () => {
	let record: PersistedWizardSnapshot<SimpleData> | null = null;
	return {
		adapter: {
			load: (): PersistedWizardSnapshot<SimpleData> | null => record,
			save: (snapshot: PersistedWizardSnapshot<SimpleData>): void => {
				// round-trip through JSON like a real web-storage adapter would
				record = JSON.parse(JSON.stringify(snapshot));
			},
			clear: (): void => {
				record = null;
			},
		},
		peek: (): PersistedWizardSnapshot<SimpleData> | null => record,
		seed: (snapshot: PersistedWizardSnapshot<SimpleData>): void => {
			record = snapshot;
		},
	};
};

describe("createPersistencePlugin — integration with a real WizardMachine", () => {
	it("round-trips a session into a second machine", async () => {
		const store = memoryStore();
		const a = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[createPersistencePlugin<SimpleData>({ adapter: store.adapter })],
		);
		await a.goNext();
		await a.goNext();
		await flush();

		const pluginA = createPersistencePlugin<SimpleData>({
			adapter: store.adapter,
		});
		// the machine-registered plugin already wrote on each transition
		expect(store.peek()).not.toBeNull();
		const expected = a.serialize();

		const b = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[pluginA],
		);
		await expect(pluginA.ready).resolves.toMatchObject({ status: "restored" });
		expect(b.snapshot.currentStepId).toBe("step3");
		expect(b.history).toEqual(expected.history);
		expect(b.visited).toEqual(expected.visitedSteps);
		expect(b.snapshot.stepStatuses).toEqual(expected.stepStatuses);
	});

	it("restores synchronously when registered through the constructor", () => {
		const store = memoryStore();
		store.seed({
			envelope: 1,
			version: 1,
			savedAt: Date.now(),
			state: {
				version: 1,
				currentStepId: "step2",
				data: { name: "restored", email: "r@x.io" },
				isValid: true,
				isCompleted: false,
				stepStatuses: {
					step1: "completed",
					step2: "active",
					step3: "pristine",
				},
				visitedSteps: ["step1", "step2"],
				history: ["step1", "step2"],
			},
		});

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[createPersistencePlugin<SimpleData>({ adapter: store.adapter })],
		);

		// asserted before ANY await: the constructor already applied the snapshot
		expect(m.snapshot.currentStepId).toBe("step2");
		expect(m.snapshot.data.name).toBe("restored");
	});

	it("restores synchronously when registered through use()", () => {
		const store = memoryStore();
		store.seed({
			envelope: 1,
			version: 1,
			savedAt: Date.now(),
			state: {
				version: 1,
				currentStepId: "step3",
				data: { name: "late", email: "l@x.io" },
				isValid: true,
				isCompleted: false,
				stepStatuses: {
					step1: "completed",
					step2: "completed",
					step3: "active",
				},
				visitedSteps: ["step1", "step2", "step3"],
				history: ["step1", "step2", "step3"],
			},
		});

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
		);
		m.use(createPersistencePlugin<SimpleData>({ adapter: store.adapter }));

		expect(m.snapshot.currentStepId).toBe("step3");
		expect(m.snapshot.data.name).toBe("late");
	});

	it("writes a debounced record after a data change", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const m = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				initial,
				{},
				[
					createPersistencePlugin<SimpleData>({
						adapter: store.adapter,
						debounceMs: 300,
					}),
				],
			);
			m.updateField("name", "typed");
			await vi.advanceTimersByTimeAsync(299);
			expect(store.peek()).toBeNull();

			await vi.advanceTimersByTimeAsync(1);
			expect(store.peek()?.state.data.name).toBe("typed");
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears the record on cancel() and drops the pre-cancel write", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const m = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				initial,
				{},
				[
					createPersistencePlugin<SimpleData>({
						adapter: store.adapter,
						debounceMs: 300,
					}),
				],
			);
			m.updateField("name", "typed");
			await m.cancel();
			await vi.advanceTimersByTimeAsync(1_000);

			expect(store.peek()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears the record when the wizard completes", async () => {
		const store = memoryStore();
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[createPersistencePlugin<SimpleData>({ adapter: store.adapter })],
		);
		await m.goNext();
		await m.goNext();
		await flush();
		expect(store.peek()).not.toBeNull();

		await m.submit();
		await flush();

		expect(m.snapshot.isCompleted).toBe(true);
		expect(store.peek()).toBeNull();
	});

	it("swallows an unknown-step record without touching the machine error channel", async () => {
		const store = memoryStore();
		store.seed({
			envelope: 1,
			version: 1,
			savedAt: Date.now(),
			state: {
				version: 1,
				currentStepId: "ghost",
				data: initial,
				isValid: true,
				isCompleted: false,
				stepStatuses: { ghost: "active" },
				visitedSteps: ["ghost"],
				history: ["ghost"],
			},
		});
		const onError = vi.fn();
		const onRestoreError = vi.fn();

		const plugin = createPersistencePlugin<SimpleData>({
			adapter: store.adapter,
			onRestoreError,
		});
		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{ onError },
			[plugin],
		);
		await flush();

		expect(m.snapshot.currentStepId).toBe("step1");
		expect(onRestoreError).toHaveBeenCalledTimes(1);
		expect(onRestoreError.mock.calls[0][0]).toBeInstanceOf(WizardRestoreError);
		expect(onError).not.toHaveBeenCalled();
		expect(store.peek()).toBeNull(); // poison record dropped
		await expect(plugin.ready).resolves.toMatchObject({ status: "failed" });
	});

	it("flushes a pending write through machine.destroy()", async () => {
		vi.useFakeTimers();
		try {
			const store = memoryStore();
			const m = new WizardMachine<SimpleData>(
				createSimpleLinearDefinition(),
				{},
				initial,
				{},
				[
					createPersistencePlugin<SimpleData>({
						adapter: store.adapter,
						debounceMs: 5_000,
					}),
				],
			);
			m.updateField("name", "unsaved");
			await m.destroy();

			expect(m.isDestroyed).toBe(true);
			expect(store.peek()?.state.data.name).toBe("unsaved");
		} finally {
			vi.useRealTimers();
		}
	});

	it("never echoes a restore back into a save", async () => {
		const store = memoryStore();
		const seeded: PersistedWizardSnapshot<SimpleData> = {
			envelope: 1,
			version: 1,
			savedAt: Date.now(),
			state: {
				version: 1,
				currentStepId: "step2",
				data: { name: "restored", email: "r@x.io" },
				isValid: true,
				isCompleted: false,
				stepStatuses: {
					step1: "completed",
					step2: "active",
					step3: "pristine",
				},
				visitedSteps: ["step1", "step2"],
				history: ["step1", "step2"],
			},
		};
		store.seed(seeded);
		const save = vi.spyOn(store.adapter, "save");

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[createPersistencePlugin<SimpleData>({ adapter: store.adapter })],
		);
		await flush();
		await flush();

		expect(m.snapshot.currentStepId).toBe("step2");
		expect(save).not.toHaveBeenCalled();
	});

	it("coexists with the logging and analytics plugins", async () => {
		const store = memoryStore();
		const logger = { log: vi.fn(), warn: vi.fn(), debug: vi.fn() };
		const stepViews: string[] = [];
		const analytics = createAnalyticsPlugin<SimpleData>({
			onStepView: (stepId) => stepViews.push(stepId),
		});

		const m = new WizardMachine<SimpleData>(
			createSimpleLinearDefinition(),
			{},
			initial,
			{},
			[
				createLoggingPlugin<SimpleData>({ logger }),
				analytics,
				createPersistencePlugin<SimpleData>({ adapter: store.adapter }),
			],
		);
		await m.goNext();
		await flush();

		expect(m.snapshot.currentStepId).toBe("step2");
		expect(stepViews).toEqual(["step1", "step2"]);
		expect(logger.debug).toHaveBeenCalled();
		expect(store.peek()?.state.currentStepId).toBe("step2");
	});
});
