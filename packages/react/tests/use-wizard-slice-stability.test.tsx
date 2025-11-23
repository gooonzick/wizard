import { act, renderHook, waitFor } from "@testing-library/react";
import { createLinearWizard } from "@wizard/core";
import { describe, expect, it } from "vitest";
import { useWizard } from "../src/use-wizard";

describe("useWizard slice stability", () => {
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

	describe("stateSlice stability", () => {
		it("should maintain same reference when dependencies don't change", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.state).toBeDefined();
			});

			const firstStateSlice = result.current.state;

			// Force re-render without changing state
			act(() => {
				rerender();
			});

			const secondStateSlice = result.current.state;

			expect(firstStateSlice).toBe(secondStateSlice);
		});

		it("should create new reference when currentStepId changes", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			const firstStateSlice = result.current.state;

			// Navigate to next step
			await act(async () => {
				await result.current.navigation.goNext();
			});

			const secondStateSlice = result.current.state;

			expect(firstStateSlice).not.toBe(secondStateSlice);
			expect(firstStateSlice.currentStepId).toBe("step1");
			expect(secondStateSlice.currentStepId).toBe("step2");
		});

		it("should create new reference when data changes", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.state).toBeDefined();
			});

			const firstStateSlice = result.current.state;

			// Update data
			act(() => {
				result.current.actions.updateField("name", "John");
			});

			const secondStateSlice = result.current.state;

			expect(firstStateSlice).not.toBe(secondStateSlice);
			expect(firstStateSlice.data.name).toBe("");
			expect(secondStateSlice.data.name).toBe("John");
		});
	});

	describe("validationSlice stability", () => {
		it("should maintain same reference when validation state doesn't change", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.validation).toBeDefined();
			});

			const firstValidationSlice = result.current.validation;

			// Force re-render without changing validation
			act(() => {
				rerender();
			});

			const secondValidationSlice = result.current.validation;

			expect(firstValidationSlice).toBe(secondValidationSlice);
		});

		it("should create new reference when validation state changes", async () => {
			const defWithValidation = createLinearWizard<{
				name: string;
				email: string;
			}>({
				id: "test",
				steps: [
					{
						id: "step1",
						title: "Step 1",
						validate: async (data) => {
							if (!data.name) {
								return {
									valid: false,
									errors: { name: "Name is required" },
								};
							}
							return { valid: true };
						},
					},
				],
			});

			const { result } = renderHook(() =>
				useWizard({
					definition: defWithValidation,
					initialData: { name: "", email: "" },
				}),
			);

			const firstValidationSlice = result.current.validation;

			// Trigger validation
			await act(async () => {
				await result.current.actions.validate();
			});

			const secondValidationSlice = result.current.validation;

			expect(firstValidationSlice).not.toBe(secondValidationSlice);
		});
	});

	describe("navigationSlice stability", () => {
		it("should maintain same reference when navigation state doesn't change", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.navigation).toBeDefined();
			});

			const firstNavigationSlice = result.current.navigation;

			// Force re-render without changing navigation
			act(() => {
				rerender();
			});

			const secondNavigationSlice = result.current.navigation;

			expect(firstNavigationSlice).toBe(secondNavigationSlice);
		});

		it("should create new reference when navigation state changes", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			const firstNavigationSlice = result.current.navigation;

			// Navigate to next step
			await act(async () => {
				await result.current.navigation.goNext();
			});

			const secondNavigationSlice = result.current.navigation;

			expect(firstNavigationSlice).not.toBe(secondNavigationSlice);
			expect(firstNavigationSlice.isFirstStep).toBe(true);
			expect(secondNavigationSlice.isFirstStep).toBe(false);
		});

		it("should maintain stable navigation methods", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			const firstGoNext = result.current.navigation.goNext;
			const firstGoPrevious = result.current.navigation.goPrevious;
			const firstGoBack = result.current.navigation.goBack;
			const firstGoToStep = result.current.navigation.goToStep;

			// Navigate to next step
			await act(async () => {
				await result.current.navigation.goNext();
			});

			// Methods should remain stable (same reference)
			expect(result.current.navigation.goNext).toBe(firstGoNext);
			expect(result.current.navigation.goPrevious).toBe(firstGoPrevious);
			expect(result.current.navigation.goBack).toBe(firstGoBack);
			expect(result.current.navigation.goToStep).toBe(firstGoToStep);
		});
	});

	describe("loadingSlice stability", () => {
		it("should maintain same reference when loading state doesn't change", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.loading).toBeDefined();
			});

			const firstLoadingSlice = result.current.loading;

			// Force re-render without changing loading state
			act(() => {
				rerender();
			});

			const secondLoadingSlice = result.current.loading;

			expect(firstLoadingSlice).toBe(secondLoadingSlice);
		});

		it("should create new reference when loading state changes", async () => {
			const defWithAsyncValidation = createLinearWizard<{
				name: string;
				email: string;
			}>({
				id: "test",
				steps: [
					{
						id: "step1",
						title: "Step 1",
						validate: async () => {
							// Simulate async validation
							await new Promise((resolve) => setTimeout(resolve, 10));
							return { valid: true };
						},
					},
				],
			});

			const { result } = renderHook(() =>
				useWizard({
					definition: defWithAsyncValidation,
					initialData: { name: "", email: "" },
				}),
			);

			const firstLoadingSlice = result.current.loading;
			expect(firstLoadingSlice.isValidating).toBe(false);

			// Start validation (don't await yet)
			let validationPromise: Promise<void>;
			act(() => {
				validationPromise = result.current.actions.validate();
			});

			// Loading slice should change
			const secondLoadingSlice = result.current.loading;
			expect(secondLoadingSlice).not.toBe(firstLoadingSlice);
			expect(secondLoadingSlice.isValidating).toBe(true);

			// Wait for validation to complete
			await act(async () => {
				await validationPromise;
			});

			// Loading slice should change again
			const thirdLoadingSlice = result.current.loading;
			expect(thirdLoadingSlice).not.toBe(secondLoadingSlice);
			expect(thirdLoadingSlice.isValidating).toBe(false);
		});
	});

	describe("actionsSlice stability", () => {
		it("should maintain same reference across re-renders", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.actions).toBeDefined();
			});

			const firstActionsSlice = result.current.actions;

			// Force re-render
			act(() => {
				rerender();
			});

			const secondActionsSlice = result.current.actions;

			expect(firstActionsSlice).toBe(secondActionsSlice);
		});

		it("should maintain stable action methods", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.actions).toBeDefined();
			});

			const firstUpdateData = result.current.actions.updateData;
			const firstSetData = result.current.actions.setData;
			const firstUpdateField = result.current.actions.updateField;
			const firstValidate = result.current.actions.validate;
			const firstCanSubmit = result.current.actions.canSubmit;
			const firstSubmit = result.current.actions.submit;
			const firstReset = result.current.actions.reset;

			// Force re-render
			act(() => {
				rerender();
			});

			// All methods should remain stable (same reference)
			expect(result.current.actions.updateData).toBe(firstUpdateData);
			expect(result.current.actions.setData).toBe(firstSetData);
			expect(result.current.actions.updateField).toBe(firstUpdateField);
			expect(result.current.actions.validate).toBe(firstValidate);
			expect(result.current.actions.canSubmit).toBe(firstCanSubmit);
			expect(result.current.actions.submit).toBe(firstSubmit);
			expect(result.current.actions.reset).toBe(firstReset);
		});

		it("should maintain stable action methods even after data updates", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.actions).toBeDefined();
			});

			const firstUpdateField = result.current.actions.updateField;

			// Update data
			act(() => {
				result.current.actions.updateField("name", "John");
			});

			// Methods should remain stable
			expect(result.current.actions.updateField).toBe(firstUpdateField);
		});
	});

	describe("Full return object stability", () => {
		it("should create new return object when any slice changes", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			const firstReturn = result.current;

			// Navigate to next step
			await act(async () => {
				await result.current.navigation.goNext();
			});

			const secondReturn = result.current;

			// Return object should be new
			expect(firstReturn).not.toBe(secondReturn);

			// But unchanged slices should remain stable
			expect(firstReturn.validation).toBe(secondReturn.validation);
			expect(firstReturn.actions).toBe(secondReturn.actions);
		});

		it("should maintain stability when no dependencies change", async () => {
			const { result, rerender } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current).toBeDefined();
			});

			const firstReturn = result.current;

			// Force re-render without changing anything
			act(() => {
				rerender();
			});

			const secondReturn = result.current;

			// Should be the same reference
			expect(firstReturn).toBe(secondReturn);
		});
	});

	describe("Granular hook optimization", () => {
		it("should prevent unnecessary re-renders in granular hooks", async () => {
			const { result } = renderHook(() =>
				useWizard({
					definition,
					initialData,
				}),
			);

			await waitFor(() => {
				expect(result.current.validation).toBeDefined();
			});

			// Simulate what useWizardValidation() does - it just returns wizard.validation
			const validationSlice1 = result.current.validation;

			// Update data (doesn't affect validation)
			act(() => {
				result.current.actions.updateField("name", "John");
			});

			const validationSlice2 = result.current.validation;

			// Validation slice should remain stable even though data changed
			expect(validationSlice1).toBe(validationSlice2);
		});

		it("should allow independent updates to different slices", async () => {
			const defWithValidation = createLinearWizard<{
				name: string;
				email: string;
			}>({
				id: "test",
				steps: [
					{
						id: "step1",
						title: "Step 1",
						validate: async (data) => {
							if (!data.name) {
								return {
									valid: false,
									errors: { name: "Name is required" },
								};
							}
							return { valid: true };
						},
					},
					{
						id: "step2",
						title: "Step 2",
					},
				],
			});

			const { result } = renderHook(() =>
				useWizard({
					definition: defWithValidation,
					initialData: { name: "", email: "" },
				}),
			);

			const initialState = result.current.state;
			const initialValidation = result.current.validation;
			const initialActions = result.current.actions;

			// Trigger validation - should only affect validation slice, not state or actions
			await act(async () => {
				await result.current.actions.validate();
			});

			// State and actions should remain stable
			expect(result.current.state).toBe(initialState);
			expect(result.current.actions).toBe(initialActions);
			// Validation should change
			expect(result.current.validation).not.toBe(initialValidation);

			const afterValidationActions = result.current.actions;

			// Update data to make it valid for navigation
			act(() => {
				result.current.actions.updateField("name", "John");
			});

			// Navigate - should affect state and navigation, but not actions
			await act(async () => {
				await result.current.navigation.goNext();
			});

			// Actions should remain stable
			expect(result.current.actions).toBe(afterValidationActions);
			// State should change (due to navigation)
			expect(result.current.state).not.toBe(initialState);
			// Validation may change due to new step or re-validation
		});
	});
});
