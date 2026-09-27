import type { WizardDefinition } from "@gooonzick/wizard-core";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";
import {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
} from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

interface D extends Record<string, unknown> {
	name: string;
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

/** step1's onLeave blocks until the returned `release()` is called. */
function blockingDefinition() {
	let gate = deferred();
	const definition: WizardDefinition<D> = {
		id: "shared-actions",
		initialStepId: "step1",
		steps: {
			step1: {
				id: "step1",
				next: { type: "static", to: "step2" },
				onLeave: () => gate.promise,
			},
			step2: { id: "step2", previous: { type: "static", to: "step1" } },
		},
	};
	return {
		definition,
		release: () => {
			gate.resolve();
			gate = deferred();
		},
	};
}

const plainDefinition: WizardDefinition<D> = {
	id: "shared-actions-plain",
	initialStepId: "step1",
	steps: {
		step1: { id: "step1", next: { type: "static", to: "step2" } },
		step2: { id: "step2", previous: { type: "static", to: "step1" } },
	},
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("loading flags: busy-rejected double goNext", () => {
	it("useWizard keeps isNavigating true until the first navigation settles", async () => {
		const { definition, release } = blockingDefinition();
		const { result } = renderHook(() =>
			useWizard<D>({ definition, initialData: { name: "" } }),
		);
		await act(flush);

		let first!: Promise<void>;
		let second!: Promise<void>;
		act(() => {
			first = result.current.navigation.goNext();
			second = result.current.navigation.goNext();
		});
		const secondOutcome = second.then(
			() => "resolved",
			(error: Error) => error.message,
		);
		// Let the rejected second call's `finally` run before asserting.
		await act(flush);

		expect(await secondOutcome).toMatch(/busy|in progress/i);
		expect(result.current.loading.isNavigating).toBe(true);
		expect(result.current.state.currentStepId).toBe("step1");

		await act(async () => {
			release();
			await first;
		});

		expect(result.current.loading.isNavigating).toBe(false);
		expect(result.current.state.currentStepId).toBe("step2");
	});

	it("granular hooks keep isNavigating true until the first navigation settles", async () => {
		const { definition, release } = blockingDefinition();
		const wrapper = ({ children }: { children: ReactNode }) => (
			<WizardProvider definition={definition} initialData={{ name: "" }}>
				{children}
			</WizardProvider>
		);
		const { result } = renderHook(
			() => ({
				navigation: useWizardNavigation(),
				loading: useWizardLoading(),
				data: useWizardData<D>(),
			}),
			{ wrapper },
		);
		await act(flush);

		let first!: Promise<void>;
		let second!: Promise<void>;
		act(() => {
			first = result.current.navigation.goNext();
			second = result.current.navigation.goNext();
		});
		const secondOutcome = second.then(
			() => "resolved",
			(error: Error) => error.message,
		);
		await act(flush);

		expect(await secondOutcome).toMatch(/busy|in progress/i);
		expect(result.current.loading.isNavigating).toBe(true);

		await act(async () => {
			release();
			await first;
		});

		expect(result.current.loading.isNavigating).toBe(false);
		expect(result.current.data.currentStepId).toBe("step2");
	});
});

describe("reset(data) sets a sticky baseline", () => {
	it("useWizard: reset(X) then reset() resets to X", async () => {
		const { result } = renderHook(() =>
			useWizard<D>({
				definition: plainDefinition,
				initialData: { name: "original" },
			}),
		);
		await act(flush);

		act(() => {
			result.current.actions.reset({ name: "X" });
		});
		expect(result.current.state.data.name).toBe("X");

		act(() => {
			result.current.actions.updateField("name", "Y");
		});
		expect(result.current.state.data.name).toBe("Y");

		act(() => {
			result.current.actions.reset();
		});
		expect(result.current.state.data.name).toBe("X");
	});

	it("granular: reset(X) then reset() resets to X", async () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<WizardProvider
				definition={plainDefinition}
				initialData={{ name: "original" }}
			>
				{children}
			</WizardProvider>
		);
		const { result } = renderHook(
			() => ({ data: useWizardData<D>(), actions: useWizardActions<D>() }),
			{ wrapper },
		);
		await act(flush);

		act(() => {
			result.current.actions.reset({ name: "X" });
		});
		expect(result.current.data.data.name).toBe("X");

		act(() => {
			result.current.actions.updateField("name", "Y");
		});
		expect(result.current.data.data.name).toBe("Y");

		act(() => {
			result.current.actions.reset();
		});
		expect(result.current.data.data.name).toBe("X");
	});
});

describe("callbacks are read at call time", () => {
	it("useWizard uses callbacks swapped after the first render", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const { result, rerender } = renderHook(
			({ onStepEnter }: { onStepEnter: (stepId: string) => void }) =>
				useWizard<D>({
					definition: plainDefinition,
					initialData: { name: "" },
					onStepEnter,
				}),
			{ initialProps: { onStepEnter: first } },
		);
		await act(flush);
		first.mockClear();

		rerender({ onStepEnter: second });
		await act(async () => {
			await result.current.navigation.goNext();
		});

		expect(second).toHaveBeenCalledWith("step2", expect.anything());
		expect(first).not.toHaveBeenCalled();
	});

	it("WizardProvider uses callbacks swapped after the first render", async () => {
		const first = vi.fn();
		const second = vi.fn();
		let onStepEnter = first;
		const wrapper = ({ children }: { children: ReactNode }) => (
			<WizardProvider
				definition={plainDefinition}
				initialData={{ name: "" }}
				onStepEnter={onStepEnter}
			>
				{children}
			</WizardProvider>
		);
		const { result, rerender } = renderHook(() => useWizardNavigation(), {
			wrapper,
		});
		await act(flush);
		first.mockClear();

		onStepEnter = second;
		rerender();
		await act(async () => {
			await result.current.goNext();
		});

		expect(second).toHaveBeenCalledWith("step2", expect.anything());
		expect(first).not.toHaveBeenCalled();
	});

	it("reset/restore failures reach the onError swapped in after mount", async () => {
		const staleOnError = vi.fn();
		const liveOnError = vi.fn();
		const { result, rerender } = renderHook(
			({ onError }: { onError: (error: Error) => void }) =>
				useWizard<D>({
					definition: plainDefinition,
					initialData: { name: "" },
					onError,
				}),
			{ initialProps: { onError: staleOnError } },
		);
		await act(flush);

		rerender({ onError: liveOnError });
		act(() => {
			result.current.actions.restore({ version: -1 } as never);
		});
		await act(flush);

		expect(liveOnError).toHaveBeenCalledTimes(1);
		expect(staleOnError).not.toHaveBeenCalled();
	});
});

describe("shared action identities", () => {
	it("granular useWizardNavigation and useWizardActions share one action set", async () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<WizardProvider definition={plainDefinition} initialData={{ name: "" }}>
				{children}
			</WizardProvider>
		);
		const { result, rerender } = renderHook(
			() => ({
				a: useWizardNavigation(),
				b: useWizardNavigation(),
				actions: useWizardActions<D>(),
			}),
			{ wrapper },
		);
		await act(flush);
		const { goNext } = result.current.a;
		const { reset } = result.current.actions;

		expect(result.current.b.goNext).toBe(goNext);
		rerender();
		expect(result.current.a.goNext).toBe(goNext);
		expect(result.current.actions.reset).toBe(reset);
		expect(result.current.actions).not.toHaveProperty("goNext");
	});
});
