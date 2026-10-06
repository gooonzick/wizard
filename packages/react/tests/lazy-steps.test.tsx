import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";

type D = { name: string };

describe("useWizard — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep while a lazy step loads, and actions.preloadStep", async () => {
		let release!: () => void;
		const load = vi.fn(
			() =>
				new Promise<{ onEnter?: () => void }>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>;
		const definition: WizardDefinition<D> = {
			id: "react-lazy",
			initialStepId: "a",
			steps: {
				a: { id: "a", next: { type: "static", to: "b" } },
				b: { id: "b", load },
			},
		};
		const { result } = renderHook(() =>
			useWizard({ definition, initialData: { name: "" } }),
		);
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(typeof result.current.actions.preloadStep).toBe("function");

		let nav!: Promise<void>;
		act(() => {
			nav = result.current.navigation.goNext();
		});
		await waitFor(() => expect(result.current.loading.isLoadingStep).toBe(true));

		await act(async () => {
			release();
			await nav;
		});
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(result.current.state.currentStepId).toBe("b");
	});
});
