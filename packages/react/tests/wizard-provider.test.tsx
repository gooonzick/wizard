import { createLinearWizard } from "@gooonzick/wizard-core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	useWizardProviderContext,
	WizardProvider,
} from "../src/wizard-provider";

describe("WizardProvider", () => {
	const definition = createLinearWizard<{ name: string }>({
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
		],
	});

	it("should provide wizard context to children", () => {
		const TestComponent = () => {
			const context = useWizardProviderContext<{ name: string }>();
			return <div>{context ? "context-available" : "context-missing"}</div>;
		};

		render(
			<WizardProvider definition={definition} initialData={{ name: "" }}>
				<TestComponent />
			</WizardProvider>,
		);

		expect(screen.getByText("context-available")).toBeDefined();
	});

	it("should throw error when using context hook outside provider", () => {
		const TestComponent = () => {
			try {
				// biome-ignore lint/correctness/useHookAtTopLevel: test purpose
				useWizardProviderContext();
				return <div>no-error</div>;
			} catch {
				return <div>error-caught</div>;
			}
		};

		render(<TestComponent />);
		expect(screen.getByText("error-caught")).toBeDefined();
	});

	it("should render children correctly", () => {
		render(
			<WizardProvider definition={definition} initialData={{ name: "" }}>
				<div>child-content</div>
			</WizardProvider>,
		);

		expect(screen.getByText("child-content")).toBeDefined();
	});

	it("should expose manager through context", () => {
		const TestComponent = () => {
			const { manager } = useWizardProviderContext<{ name: string }>();
			const snapshot = manager.getStateSnapshot();
			return (
				<div>
					<div>step: {snapshot.currentStepId}</div>
					<div>data: {snapshot.data.name}</div>
				</div>
			);
		};

		render(
			<WizardProvider definition={definition} initialData={{ name: "test" }}>
				<TestComponent />
			</WizardProvider>,
		);

		expect(screen.getByText("step: step1")).toBeDefined();
		expect(screen.getByText("data: test")).toBeDefined();
	});
});
