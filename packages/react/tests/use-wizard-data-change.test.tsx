import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWizard } from "../src/use-wizard";

describe("useWizard onDataChange option (WIZ-010)", () => {
	const makeDefinition = () =>
		createLinearWizard<{ name: string; email: string }>({
			id: "data-change-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

	it("invokes onDataChange when updateField mutates a field", async () => {
		const onDataChange = vi.fn();
		const { result } = renderHook(() =>
			useWizard({
				definition: makeDefinition(),
				initialData: { name: "a", email: "a@x.io" },
				onDataChange,
			}),
		);

		await act(async () => {
			result.current.actions.updateField("name", "b");
		});

		expect(onDataChange).toHaveBeenCalledTimes(1);
		const [prev, next, changedFields] = onDataChange.mock.calls[0];
		expect(prev.name).toBe("a");
		expect(next.name).toBe("b");
		expect(changedFields).toEqual(["name"]);
	});

	it("invokes onDataChange when updateData mutates data", async () => {
		const onDataChange = vi.fn();
		const { result } = renderHook(() =>
			useWizard({
				definition: makeDefinition(),
				initialData: { name: "a", email: "a@x.io" },
				onDataChange,
			}),
		);

		await act(async () => {
			result.current.actions.updateData((d) => ({ ...d, email: "b@x.io" }));
		});

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["email"]);
	});
});
