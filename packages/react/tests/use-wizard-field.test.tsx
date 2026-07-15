import { createLinearWizard } from "@gooonzick/wizard-core";
import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWizard } from "../src/use-wizard";
import { useWizardField } from "../src/use-wizard-granular";
import { WizardProvider } from "../src/wizard-provider";

describe("useWizardField", () => {
	it("binds a provider-backed field via a [value, setValue] tuple", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "test-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const captured: {
			value: string;
			setValue: (v: string) => void;
		} = { value: "", setValue: () => {} };

		const Child = () => {
			const [name, setName] = useWizardField<{ name: string }, "name">("name");
			captured.value = name;
			captured.setValue = setName;
			return <div>{name}</div>;
		};

		render(
			<WizardProvider definition={definition} initialData={{ name: "" }}>
				<Child />
			</WizardProvider>,
		);

		expect(captured.value).toBe("");

		await act(async () => {
			captured.setValue("Alice");
		});

		expect(captured.value).toBe("Alice");
	});

	it("binds a field against a direct useWizard return value", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "direct-wizard",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { result } = renderHook(() => {
			const wizard = useWizard({
				definition,
				initialData: { name: "Initial" },
			});
			const field = useWizardField(wizard, "name");
			return { field };
		});

		expect(result.current.field[0]).toBe("Initial");

		await act(async () => {
			result.current.field[1]("Updated");
		});

		expect(result.current.field[0]).toBe("Updated");
	});

	it("binds multiple independent fields against the same wizard", async () => {
		const definition = createLinearWizard<{ first: string; last: string }>({
			id: "multi-field",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { result } = renderHook(() => {
			const wizard = useWizard({
				definition,
				initialData: { first: "", last: "" },
			});
			const first = useWizardField(wizard, "first");
			const last = useWizardField(wizard, "last");
			return { first, last };
		});

		await act(async () => {
			result.current.first[1]("Alice");
		});
		expect(result.current.first[0]).toBe("Alice");
		expect(result.current.last[0]).toBe("");

		await act(async () => {
			result.current.last[1]("Smith");
		});
		expect(result.current.last[0]).toBe("Smith");
		expect(result.current.first[0]).toBe("Alice");
	});

	it("reflects external data updates back to the field value", async () => {
		const definition = createLinearWizard<{ name: string }>({
			id: "reflect-field",
			steps: [{ id: "step1", title: "Step 1" }],
		});

		const { result } = renderHook(() => {
			const wizard = useWizard({
				definition,
				initialData: { name: "" },
			});
			const field = useWizardField(wizard, "name");
			return { wizard, field };
		});

		// Update via actions (not via field setter)
		await act(async () => {
			result.current.wizard.actions.updateField("name", "External");
		});

		expect(result.current.field[0]).toBe("External");
	});
});
