import { render, screen } from "@solidjs/testing-library";
import { createEffect, createRoot, ErrorBoundary } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWizard } from "../src/create-wizard";
import type { CreateWizardOptions, Wizard } from "../src/types";
import { flush } from "./helpers/flush";
import {
	createTestDefinition,
	initialData,
	type SignupData,
} from "./helpers/wizard";

function makeWizard(options: Partial<CreateWizardOptions<SignupData>> = {}) {
	return createWizard<SignupData>({
		definition: createTestDefinition(),
		initialData,
		...options,
	});
}

const disposers: Array<() => void> = [];
afterEach(() => {
	for (const dispose of disposers.splice(0)) dispose();
});

describe("errors", () => {
	it("E1: a throwing effect without a boundary goes to onError and the wizard keeps working", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		createRoot((dispose) => {
			disposers.push(dispose);
			createEffect(() => {
				if (wizard.currentStepId === "plan") {
					throw new Error("boom");
				}
			});
		});

		await expect(wizard.goNext()).resolves.toBeUndefined();

		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "boom" }),
		);
		expect(onError).toHaveBeenCalledTimes(1);
		// Assert through getters, NOT another effect: Solid 1.x leaves sibling
		// effects of the interrupted flush stale for good (see spec §5).
		expect(wizard.currentStepId).toBe("plan");

		await wizard.goPrevious();
		expect(wizard.currentStepId).toBe("personal");
		expect(wizard.isNavigating).toBe(false);
	});

	it("E2: inside an <ErrorBoundary> Solid handles the error and onError is not called", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		function Thrower(props: { wizard: Wizard<SignupData> }) {
			createEffect(() => {
				if (props.wizard.currentStepId === "plan") {
					throw new Error("boom");
				}
			});
			return <p>step: {props.wizard.currentStepId}</p>;
		}

		render(() => (
			<ErrorBoundary fallback={(err: Error) => <p>caught: {err.message}</p>}>
				<Thrower wizard={wizard} />
			</ErrorBoundary>
		));

		await wizard.goNext();

		expect(await screen.findByText("caught: boom")).toBeTruthy();
		expect(onError).not.toHaveBeenCalled();
		expect(wizard.currentStepId).toBe("plan");
	});
});
