import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
} from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

describe("Granular hooks", () => {
	const definition = createLinearWizard<{ name: string; email: string }>({
		id: "test",
		steps: [
			{
				id: "step1",
				title: "Step 1",
			},
			{
				id: "step2",
				title: "Step 2",
			},
			{
				id: "step3",
				title: "Step 3",
			},
		],
	});

	const initialData = { name: "", email: "" };

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<WizardProvider definition={definition} initialData={initialData}>
			{children}
		</WizardProvider>
	);

	describe("useWizardData", () => {
		it("should return current data", () => {
			const { result } = renderHook(
				() => useWizardData<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(result.current.data).toEqual({ name: "", email: "" });
		});

		it("should return current step id", () => {
			const { result } = renderHook(
				() => useWizardData<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(result.current.currentStepId).toBe("step1");
		});

		it("should return current step definition", () => {
			const { result } = renderHook(
				() => useWizardData<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(result.current.currentStep).toBeDefined();
			expect(result.current.currentStep.meta?.title).toBe("Step 1");
		});

		it("should return isCompleted status", () => {
			const { result } = renderHook(
				() => useWizardData<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(result.current.isCompleted).toBe(false);
		});
	});

	describe("useWizardNavigation", () => {
		it("should return navigation state", async () => {
			const { result } = renderHook(() => useWizardNavigation(), {
				wrapper,
			});

			await waitFor(() => {
				expect(result.current).toHaveProperty("canGoNext");
				expect(result.current).toHaveProperty("canGoPrevious");
				expect(result.current).toHaveProperty("isFirstStep");
				expect(result.current).toHaveProperty("isLastStep");
				expect(result.current).toHaveProperty("visitedSteps");
				expect(result.current).toHaveProperty("availableSteps");
				expect(result.current).toHaveProperty("stepHistory");
			});
		});

		it("should return navigation methods", async () => {
			const { result } = renderHook(() => useWizardNavigation(), {
				wrapper,
			});

			await waitFor(() => {
				expect(result.current).toHaveProperty("goNext");
				expect(result.current).toHaveProperty("goPrevious");
				expect(result.current).toHaveProperty("goBack");
				expect(result.current).toHaveProperty("goToStep");
				expect(typeof result.current.goNext).toBe("function");
			});
		});

		it("should indicate first step correctly", async () => {
			const { result } = renderHook(() => useWizardNavigation(), {
				wrapper,
			});

			await waitFor(() => {
				expect(result.current.isFirstStep).toBe(true);
				expect(result.current.canGoPrevious).toBe(false);
			});
		});
	});

	describe("useWizardValidation", () => {
		it("should return validation state", () => {
			const { result } = renderHook(() => useWizardValidation(), {
				wrapper,
			});

			expect(result.current).toHaveProperty("isValid");
			expect(result.current).toHaveProperty("validationErrors");
		});

		it("should be valid initially when no validators", () => {
			const { result } = renderHook(() => useWizardValidation(), {
				wrapper,
			});

			expect(result.current.isValid).toBe(true);
		});
	});

	describe("useWizardLoading", () => {
		it("should return loading states", () => {
			const { result } = renderHook(() => useWizardLoading(), {
				wrapper,
			});

			expect(result.current).toHaveProperty("isValidating");
			expect(result.current).toHaveProperty("isSubmitting");
			expect(result.current).toHaveProperty("isNavigating");
		});

		it("should not be loading initially", () => {
			const { result } = renderHook(() => useWizardLoading(), {
				wrapper,
			});

			expect(result.current.isValidating).toBe(false);
			expect(result.current.isSubmitting).toBe(false);
			expect(result.current.isNavigating).toBe(false);
		});
	});

	describe("useWizardActions", () => {
		it("should return action methods", () => {
			const { result } = renderHook(
				() => useWizardActions<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(result.current).toHaveProperty("updateData");
			expect(result.current).toHaveProperty("setData");
			expect(result.current).toHaveProperty("updateField");
			expect(result.current).toHaveProperty("validate");
			expect(result.current).toHaveProperty("canSubmit");
			expect(result.current).toHaveProperty("submit");
			expect(result.current).toHaveProperty("reset");
		});

		it("should update data when using updateField", async () => {
			// Note: Testing updateField with individual hooks requires a combined context
			// This is covered in the "Integration" tests below where we use multiple hooks together
			const { result } = renderHook(
				() => useWizardActions<{ name: string; email: string }>(),
				{ wrapper },
			);

			expect(typeof result.current.updateField).toBe("function");
		});
	});

	describe("Integration: using multiple granular hooks together", () => {
		it("should allow navigation and data updates", async () => {
			// Create a wrapper component that uses multiple hooks
			function useAllHooks() {
				const data = useWizardData<{ name: string; email: string }>();
				const navigation = useWizardNavigation();
				const actions = useWizardActions<{ name: string; email: string }>();
				return { data, navigation, actions };
			}

			const { result } = renderHook(() => useAllHooks(), { wrapper });

			// Initial state
			expect(result.current.data.currentStepId).toBe("step1");
			expect(result.current.data.data.name).toBe("");

			// Update data
			act(() => {
				result.current.actions.updateField("name", "John");
			});

			await waitFor(() => {
				expect(result.current.data.data.name).toBe("John");
			});

			// Navigate to next step
			await act(async () => {
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				expect(result.current.data.currentStepId).toBe("step2");
			});
		});

		it("should maintain data across navigation", async () => {
			function useAllHooks() {
				const data = useWizardData<{ name: string; email: string }>();
				const navigation = useWizardNavigation();
				const actions = useWizardActions<{ name: string; email: string }>();
				return { data, navigation, actions };
			}

			const { result } = renderHook(() => useAllHooks(), { wrapper });

			// Set initial data
			act(() => {
				result.current.actions.updateField("name", "Jane");
				result.current.actions.updateField("email", "jane@example.com");
			});

			// Navigate forward
			await act(async () => {
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				expect(result.current.data.currentStepId).toBe("step2");
			});

			// Data should persist
			expect(result.current.data.data.name).toBe("Jane");
			expect(result.current.data.data.email).toBe("jane@example.com");

			// Navigate back
			await act(async () => {
				await result.current.navigation.goPrevious();
			});

			await waitFor(() => {
				expect(result.current.data.currentStepId).toBe("step1");
			});

			// Data should still be there
			expect(result.current.data.data.name).toBe("Jane");
		});
	});

	describe("Error handling", () => {
		it("should throw error when used outside provider", () => {
			// Suppress console.error for expected error
			const spy = vi.spyOn(console, "error").mockImplementation(() => {});

			expect(() => {
				renderHook(() => useWizardData());
			}).toThrow(
				"useWizardProviderContext must be used within <WizardProvider>",
			);

			spy.mockRestore();
		});
	});
});
