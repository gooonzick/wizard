import { describe, expect, it, vi } from "vitest";
import {
	WizardNavigationError,
	WizardStepLoadError,
	WizardValidationError,
} from "../src/errors";
import {
	WizardMachine,
	type WizardEvents,
	type WizardSerializedState,
	type WizardState,
} from "../src/machine/wizard-machine";
import type { WizardPlugin } from "../src/plugins/types";
import type { WizardDefinition } from "../src/types/definition";
import type {
	LazyStepImplementation,
	StepLoader,
	WizardStepDefinition,
} from "../src/types/step";

type Data = { name: string; passport: string };
const initialData: Data = { name: "", passport: "" };

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<V = void>() {
	let resolve!: (v: V) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<V>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** A loader whose every call parks on a fresh deferred the test settles. */
function controlledLoader(impl: LazyStepImplementation<Data> = {}) {
	const pending: Array<ReturnType<typeof deferred<LazyStepImplementation<Data>>>> =
		[];
	const load = vi.fn(() => {
		const d = deferred<LazyStepImplementation<Data>>();
		pending.push(d);
		return d.promise;
	});
	return {
		load: load as unknown as StepLoader<Data> & typeof load,
		resolve: (i = pending.length - 1) => pending[i].resolve(impl),
		reject: (error: unknown = new Error("chunk failed"), i = pending.length - 1) =>
			pending[i].reject(error),
	};
}

/** account -> documents (lazy) -> summary */
function lazyDefinition(
	load: StepLoader<Data>,
	documents: Partial<WizardStepDefinition<Data>> = {},
): WizardDefinition<Data> {
	return {
		id: "lazy",
		initialStepId: "account",
		steps: {
			account: { id: "account", next: { type: "static", to: "documents" } },
			documents: {
				id: "documents",
				previous: { type: "static", to: "account" },
				next: { type: "static", to: "summary" },
				meta: { title: "Documents" },
				load,
				...documents,
			},
			summary: { id: "summary", previous: { type: "static", to: "documents" } },
		},
	};
}

function createMachine(
	definition: WizardDefinition<Data>,
	events: WizardEvents<Data> = {},
	plugins?: WizardPlugin<Data>[],
) {
	const states: Array<Pick<WizardState<Data>, "currentStepId" | "isLoadingStep">> =
		[];
	const machine = new WizardMachine<Data>(
		definition,
		{},
		initialData,
		{
			...events,
			onStateChange: (s) => {
				states.push({ currentStepId: s.currentStepId, isLoadingStep: s.isLoadingStep });
				events.onStateChange?.(s);
			},
		},
		plugins,
	);
	return { machine, states };
}

const documentsSnapshot: WizardSerializedState<Data> = {
	version: 1,
	currentStepId: "documents",
	data: initialData,
	isValid: true,
	isCompleted: false,
	stepStatuses: { account: "completed", documents: "active", summary: "pristine" },
	visitedSteps: ["account", "documents"],
	history: ["account", "documents"],
};

describe("WIZ-013 lazy steps — plumbing", () => {
	it("snapshot.isLoadingStep starts false and is not serialized", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await flush();
		expect(machine.snapshot.isLoadingStep).toBe(false);
		expect("isLoadingStep" in machine.serialize()).toBe(false);
	});

	it("currentStep is the skeleton before load and the merged definition after", async () => {
		const validate = vi.fn(() => ({ valid: true }));
		const { machine } = createMachine(
			lazyDefinition(vi.fn(async () => ({ validate }))),
		);
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		expect(machine.currentStep.validate).toBeUndefined();
		expect(machine.currentStep.meta?.title).toBe("Documents");

		await machine.preloadStep("documents");
		expect(machine.currentStep.validate).toBe(validate);
	});

	it("preloadStep never flips isLoadingStep and later navigation reuses the load", async () => {
		const load = vi.fn(async () => ({}));
		const { machine, states } = createMachine(lazyDefinition(load));
		await flush();
		const before = states.length;

		await machine.preloadStep("documents");
		expect(states.length).toBe(before);
		expect(load).toHaveBeenCalledTimes(1);

		await machine.goNext();
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).toHaveBeenCalledTimes(1);
		expect(states.some((s) => s.isLoadingStep)).toBe(false);
	});

	it("preloadStep rejects for an unknown step id", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		const error = await machine.preloadStep("nope").catch((e) => e);
		expect(error).toBeInstanceOf(WizardNavigationError);
		expect(error.reason).toBe("not-found");
	});

	it("preloadStep failure rejects without onError, and the next attempt retries", async () => {
		const load = vi
			.fn<StepLoader<Data>>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValue({});
		const onError = vi.fn();
		const { machine } = createMachine(lazyDefinition(load), { onError });

		await expect(machine.preloadStep("documents")).rejects.toBeInstanceOf(
			WizardStepLoadError,
		);
		expect(onError).not.toHaveBeenCalled();

		await machine.preloadStep("documents");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("preloadStep resolves immediately for steps without load", async () => {
		const { machine } = createMachine(lazyDefinition(vi.fn(async () => ({}))));
		await expect(machine.preloadStep("account")).resolves.toBeUndefined();
	});

	it("progress, isLastStep and getAvailableSteps do not trigger loads", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		const eager = createMachine(lazyDefinition(undefined as never)).machine;
		await flush();

		expect(machine.snapshot.progress).toEqual(eager.snapshot.progress);
		expect(await machine.getAvailableSteps()).toEqual(
			await eager.getAvailableSteps(),
		);
		expect(load).not.toHaveBeenCalled();
	});

	it("goTo with skipLifecycle does not load the target", async () => {
		const load = vi.fn(async () => ({}));
		const { machine } = createMachine(lazyDefinition(load));
		await machine.goTo("documents", { skipValidation: true, skipLifecycle: true });
		expect(machine.snapshot.currentStepId).toBe("documents");
		expect(load).not.toHaveBeenCalled();
	});
});
