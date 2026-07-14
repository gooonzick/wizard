import type { WizardPlugin } from "@gooonzick/wizard-core";
import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";

interface D extends Record<string, unknown> {
	name: string;
}
const def = createLinearWizard<D>({
	id: "t",
	steps: [
		{ id: "step1", title: "Step 1" },
		{ id: "step2", title: "Step 2" },
	],
});

describe("React beforeTransition veto through the binding", () => {
	it("blocks navigation and leaves the UI-visible slices untouched", async () => {
		const beforeTransition = vi.fn(() => false); // veto every transition
		const plugins: WizardPlugin<D>[] = [{ name: "veto", beforeTransition }];
		const { result } = renderHook(() =>
			useWizard<D>({ definition: def, initialData: { name: "" }, plugins }),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		const historyBefore = result.current.navigation.stepHistory;

		await act(async () => {
			await result.current.navigation.goNext();
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});

		expect(beforeTransition).toHaveBeenCalled();
		expect(result.current.state.currentStepId).toBe("step1"); // did not move
		expect(result.current.navigation.stepHistory).toEqual(historyBefore); // history untouched
		expect(result.current.navigation.canGoBack).toBe(false);
	});
});

describe("React restore through the binding", () => {
	it("restore() through the binding re-syncs the visible step", async () => {
		// Source wizard: advance to step2, then serialize.
		const source = renderHook(() =>
			useWizard<D>({ definition: def, initialData: { name: "a" } }),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		await act(async () => {
			await source.result.current.navigation.goNext();
		});
		const serialized = source.result.current.actions.serialize();
		expect(serialized.currentStepId).toBe("step2");

		// Target wizard: fresh, then restore.
		const target = renderHook(() =>
			useWizard<D>({ definition: def, initialData: { name: "" } }),
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		expect(target.result.current.state.currentStepId).toBe("step1");

		await act(async () => {
			target.result.current.actions.restore(serialized);
			await new Promise((r) => setTimeout(r, 0));
		});

		expect(target.result.current.state.currentStepId).toBe("step2");
		expect(target.result.current.state.data).toEqual(serialized.data);
	});
});
