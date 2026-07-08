import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWizard } from "../src/use-wizard";

describe("useWizard actions.validateAll", () => {
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

	it("exposes validateAll on the actions slice", async () => {
		const { result } = renderHook(() =>
			useWizard({
				definition: createTestDefinition(),
				initialData: { name: "", email: "" },
			}),
		);

		await waitFor(() => {
			expect(typeof result.current.actions.validateAll).toBe("function");
		});
	});

	it("returns a summary of invalid steps", async () => {
		const { result } = renderHook(() =>
			useWizard({
				definition: createTestDefinition(),
				initialData: { name: "", email: "" },
			}),
		);

		let summary!: Awaited<ReturnType<typeof result.current.actions.validateAll>>;
		await act(async () => {
			summary = await result.current.actions.validateAll();
		});

		expect(summary.valid).toBe(false);
		expect(summary.invalidStepIds).toEqual(["step1", "step2"]);
		expect(summary.firstInvalidStepId).toBe("step1");
	});

	it("updateStatuses:true flips invalid step statuses and re-renders", async () => {
		const { result } = renderHook(() =>
			useWizard({
				definition: createTestDefinition(),
				initialData: { name: "", email: "" },
			}),
		);

		await act(async () => {
			await result.current.actions.validateAll({ updateStatuses: true });
		});

		await waitFor(() => {
			expect(result.current.state.stepStatuses.step1).toBe("error");
			expect(result.current.state.stepStatuses.step2).toBe("error");
		});
	});
});
