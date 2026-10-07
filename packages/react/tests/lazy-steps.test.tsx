import type { StepLoader, WizardDefinition } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";
import {
	useWizardLoading,
	useWizardNavigation,
} from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

type D = { name: string };

function lazyDefinition(id: string, loader?: StepLoader<D>) {
	let release!: () => void;
	const load =
		loader ??
		(vi.fn(
			() =>
				new Promise<{ onEnter?: () => void }>((resolve) => {
					release = () => resolve({});
				}),
		) as unknown as StepLoader<D>);
	const definition: WizardDefinition<D> = {
		id,
		initialStepId: "a",
		steps: {
			a: { id: "a", next: { type: "static", to: "b" } },
			b: { id: "b", load },
		},
	};
	return { definition, load, release: () => release() };
}

describe("useWizard — lazy steps (WIZ-013)", () => {
	it("exposes isLoadingStep while a lazy step loads, and actions.preloadStep", async () => {
		const { definition, release } = lazyDefinition("react-lazy");
		const { result } = renderHook(() =>
			useWizard({ definition, initialData: { name: "" } }),
		);
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(typeof result.current.actions.preloadStep).toBe("function");

		let nav!: Promise<void>;
		act(() => {
			nav = result.current.navigation.goNext();
		});
		await waitFor(() =>
			expect(result.current.loading.isLoadingStep).toBe(true),
		);

		await act(async () => {
			release();
			await nav;
		});
		expect(result.current.loading.isLoadingStep).toBe(false);
		expect(result.current.state.currentStepId).toBe("b");
	});

	it("preloadStep loads in the background; a later navigation reuses it", async () => {
		const loader = vi.fn(async () => ({})) as unknown as StepLoader<D>;
		const { definition, load } = lazyDefinition("react-preload", loader);
		const seen: boolean[] = [];
		const { result } = renderHook(() => {
			const wizard = useWizard({ definition, initialData: { name: "" } });
			seen.push(wizard.loading.isLoadingStep);
			return wizard;
		});

		await act(async () => {
			await result.current.actions.preloadStep("b");
		});
		expect(load).toHaveBeenCalledTimes(1);

		await act(async () => {
			await result.current.navigation.goNext();
		});
		expect(result.current.state.currentStepId).toBe("b");
		expect(load).toHaveBeenCalledTimes(1);
		expect(seen).not.toContain(true);
	});

	it("actions.preloadStep never rejects when the chunk fails; navigation reports it", async () => {
		const loader = vi.fn(async () => {
			throw new Error("offline");
		}) as unknown as StepLoader<D>;
		const { definition, load } = lazyDefinition("react-preload-fail", loader);
		const onError = vi.fn();
		const { result } = renderHook(() =>
			useWizard({ definition, initialData: { name: "" }, onError }),
		);

		await act(async () => {
			await expect(
				result.current.actions.preloadStep("b"),
			).resolves.toBeUndefined();
		});
		expect(load).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();

		await act(async () => {
			await expect(result.current.navigation.goNext()).rejects.toThrow(
				/Failed to load step "b"/,
			);
		});
		expect(result.current.state.currentStepId).toBe("a");
	});

	it("granular useWizardLoading reflects isLoadingStep under WizardProvider", async () => {
		const { definition, release } = lazyDefinition("react-granular");
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<WizardProvider definition={definition} initialData={{ name: "" }}>
				{children}
			</WizardProvider>
		);
		const { result } = renderHook(
			() => ({ loading: useWizardLoading(), nav: useWizardNavigation() }),
			{ wrapper },
		);
		expect(result.current.loading.isLoadingStep).toBe(false);

		let nav!: Promise<void>;
		act(() => {
			nav = result.current.nav.goNext();
		});
		await waitFor(() =>
			expect(result.current.loading.isLoadingStep).toBe(true),
		);

		await act(async () => {
			release();
			await nav;
		});
		expect(result.current.loading.isLoadingStep).toBe(false);
	});
});
