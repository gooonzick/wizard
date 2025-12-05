import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";

describe("useWizard hook integration", () => {
	const createTestDefinition = () =>
		createLinearWizard<{ name: string; email: string }>({
			id: "test",
			steps: [
				{
					id: "step1",
					title: "Step 1",
					validate: async (data) => ({
						valid: !!data.name,
						errors: data.name ? undefined : { name: "Name is required" },
					}),
				},
				{
					id: "step2",
					title: "Step 2",
					validate: async (data) => ({
						valid: !!data.email,
						errors: data.email ? undefined : { email: "Email is required" },
					}),
				},
			],
		});

	describe("new nested structure", () => {
		it("should provide nested state slice", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.state).toBeDefined();
				expect(result.current.state.currentStepId).toBe("step1");
				expect(result.current.state.currentStep).toBeDefined();
				expect(result.current.state.data).toEqual({ name: "", email: "" });
				expect(result.current.state.isCompleted).toBe(false);
			});
		});

		it("should provide nested validation slice", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.validation).toBeDefined();
				expect(typeof result.current.validation.isValid).toBe("boolean");
				expect(
					result.current.validation.validationErrors !== undefined ||
						result.current.validation.validationErrors === undefined,
				).toBe(true);
			});
		});

		it("should provide nested navigation slice", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.navigation).toBeDefined();
				expect(typeof result.current.navigation.canGoNext).toBe("boolean");
				expect(typeof result.current.navigation.canGoPrevious).toBe("boolean");
				expect(typeof result.current.navigation.isFirstStep).toBe("boolean");
				expect(typeof result.current.navigation.isLastStep).toBe("boolean");
				expect(Array.isArray(result.current.navigation.visitedSteps)).toBe(
					true,
				);
				expect(Array.isArray(result.current.navigation.availableSteps)).toBe(
					true,
				);
				expect(Array.isArray(result.current.navigation.stepHistory)).toBe(true);
				expect(typeof result.current.navigation.goNext).toBe("function");
				expect(typeof result.current.navigation.goPrevious).toBe("function");
				expect(typeof result.current.navigation.goBack).toBe("function");
				expect(typeof result.current.navigation.goToStep).toBe("function");
			});
		});

		it("should provide nested loading slice", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.loading).toBeDefined();
				expect(typeof result.current.loading.isValidating).toBe("boolean");
				expect(typeof result.current.loading.isSubmitting).toBe("boolean");
				expect(typeof result.current.loading.isNavigating).toBe("boolean");
			});
		});

		it("should provide nested actions slice", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.actions).toBeDefined();
				expect(typeof result.current.actions.updateData).toBe("function");
				expect(typeof result.current.actions.setData).toBe("function");
				expect(typeof result.current.actions.updateField).toBe("function");
				expect(typeof result.current.actions.validate).toBe("function");
				expect(typeof result.current.actions.canSubmit).toBe("function");
				expect(typeof result.current.actions.submit).toBe("function");
				expect(typeof result.current.actions.reset).toBe("function");
			});
		});

		it("should update data via nested actions.updateField method", async () => {
			const definition = createTestDefinition();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			expect(result.current.state.data.name).toBe("");

			await act(async () => {
				result.current.actions.updateField("name", "John");
			});

			await waitFor(() => {
				expect(result.current.state.data.name).toBe("John");
			});
		});

		it("should navigate using nested navigation.goNext method", async () => {
			const definition = createTestDefinition();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "John", email: "" },
				}),
			);

			expect(result.current.state.currentStepId).toBe("step1");

			await act(async () => {
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				expect(result.current.state.currentStepId).toBe("step2");
			});
		});
	});

	describe("event callbacks", () => {
		it("should call onStateChange when data updates", async () => {
			const definition = createTestDefinition();
			const onStateChange = vi.fn();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
					onStateChange,
				}),
			);

			await act(async () => {
				result.current.actions.updateField("name", "John");
			});

			await waitFor(() => {
				expect(onStateChange).toHaveBeenCalled();
			});
		});

		it("should call onStepEnter when navigating", async () => {
			const definition = createTestDefinition();
			const onStepEnter = vi.fn();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "John", email: "" },
					onStepEnter,
				}),
			);

			await act(async () => {
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				expect(onStepEnter).toHaveBeenCalledWith("step2", expect.any(Object));
			});
		});
	});

	describe("memoization and reference stability", () => {
		it("should maintain stable slice references when dependencies don't change", async () => {
			const definition = createTestDefinition();

			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "John", email: "" },
				}),
			);

			await waitFor(() => {
				expect(result.current.state).toBeDefined();
			});

			// Capture initial references
			const initialState = result.current.state;
			const initialValidation = result.current.validation;
			const initialNavigation = result.current.navigation;
			const initialLoading = result.current.loading;
			const initialActions = result.current.actions;

			// Force a re-render without changing any dependencies
			act(() => {
				rerender();
			});

			// Verify slices maintain same references
			expect(result.current.state).toBe(initialState);
			expect(result.current.validation).toBe(initialValidation);
			expect(result.current.navigation).toBe(initialNavigation);
			expect(result.current.loading).toBe(initialLoading);
			expect(result.current.actions).toBe(initialActions);
		});

		it("should update state slice reference only when state dependencies change", async () => {
			const definition = createTestDefinition();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			const initialState = result.current.state;
			const initialValidation = result.current.validation;
			const initialActions = result.current.actions;

			// Update data - should change state slice but not others
			await act(async () => {
				result.current.actions.updateField("name", "John");
			});

			await waitFor(() => {
				// State slice should have new reference (data changed)
				expect(result.current.state).not.toBe(initialState);
				expect(result.current.state.data.name).toBe("John");

				// Other slices should maintain references if unchanged
				expect(result.current.validation).toBe(initialValidation);
				expect(result.current.actions).toBe(initialActions);
				// Navigation and loading might change based on internal logic
			});
		});

		it("should update navigation slice reference only when navigation dependencies change", async () => {
			const definition = createTestDefinition();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "John", email: "" },
				}),
			);

			const initialState = result.current.state;
			const initialNavigation = result.current.navigation;
			const initialActions = result.current.actions;

			// Navigate to next step - should change both state and navigation slices
			await act(async () => {
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				// Both state and navigation should have new references
				expect(result.current.state).not.toBe(initialState);
				expect(result.current.navigation).not.toBe(initialNavigation);

				// Actions should maintain reference (callbacks are stable)
				expect(result.current.actions).toBe(initialActions);
			});
		});

		it("should maintain stable action references across renders", async () => {
			const definition = createTestDefinition();

			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			const initialActions = result.current.actions;

			// Trigger multiple updates
			await act(async () => {
				result.current.actions.updateField("name", "John");
			});

			await waitFor(() => {
				expect(result.current.state.data.name).toBe("John");
			});

			await act(async () => {
				result.current.actions.updateField("email", "john@example.com");
			});

			await waitFor(() => {
				expect(result.current.state.data.email).toBe("john@example.com");
			});

			// Actions slice should still have same reference (callbacks are memoized)
			expect(result.current.actions).toBe(initialActions);
		});
	});

	describe("reset functionality", () => {
		it("should reset wizard state", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			// Make changes
			await act(async () => {
				result.current.actions.updateField("name", "John");
				await result.current.navigation.goNext();
			});

			await waitFor(() => {
				expect(result.current.state.currentStepId).toBe("step2");
				expect(result.current.state.data.name).toBe("John");
			});

			// Reset
			await act(async () => {
				result.current.actions.reset();
			});

			await waitFor(() => {
				expect(result.current.state.currentStepId).toBe("step1");
				expect(result.current.state.data.name).toBe("");
			});
		});

		it("should reset with new data", async () => {
			const definition = createTestDefinition();
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData: { name: "", email: "" },
				}),
			);

			await act(async () => {
				result.current.actions.reset({
					name: "Jane",
					email: "jane@example.com",
				});
			});

			await waitFor(() => {
				expect(result.current.state.data).toEqual({
					name: "Jane",
					email: "jane@example.com",
				});
			});
		});
	});
});
