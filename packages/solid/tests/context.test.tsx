import { render, screen } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import {
	createWizard,
	hasWizardContext,
	useWizardContext,
	type Wizard,
	WizardProvider,
} from "../src/index";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard() {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
	});
}

describe("context", () => {
	it("K1: a descendant receives the same wizard instance", () => {
		const wizard = makeWizard();
		let received: Wizard<SignupData> | undefined;
		let has = false;

		function Child() {
			received = useWizardContext<SignupData>();
			has = hasWizardContext();
			return <p>step: {received.currentStepId}</p>;
		}

		render(() => (
			<WizardProvider wizard={wizard}>
				<Child />
			</WizardProvider>
		));

		expect(received).toBe(wizard);
		expect(has).toBe(true);
		expect(screen.getByText("step: personal")).toBeTruthy();
	});

	it("K2: useWizardContext throws without a provider", () => {
		expect(() =>
			createRoot((dispose) => {
				try {
					return useWizardContext();
				} finally {
					dispose();
				}
			}),
		).toThrow(/WizardProvider/);
	});

	it("K3: hasWizardContext is false without a provider, even outside a root", () => {
		expect(hasWizardContext()).toBe(false);
		createRoot((dispose) => {
			expect(hasWizardContext()).toBe(false);
			dispose();
		});
	});
});
