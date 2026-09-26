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

	it("E3: an effect throwing on a loading-flag change goes to onError and navigation completes", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		await flush();
		wizard.actions.updateField("name", "ada");

		// The loading channel is written by the binding (trackLoading), not the
		// machine, so core's onStateChange isolation never sees this throw.
		createRoot((dispose) => {
			disposers.push(dispose);
			createEffect(() => {
				if (wizard.isNavigating) {
					throw new Error("loading boom");
				}
			});
		});

		await expect(wizard.goNext()).resolves.toBeUndefined();

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "loading boom" }),
		);
		expect(wizard.currentStepId).toBe("plan");
	});

	it("E4: an effect throwing on the async navigation recompute goes to onError", async () => {
		const onError = vi.fn();
		const wizard = makeWizard({ onError });
		// No flush before the effect: canGoNext starts false and only turns true
		// once the manager's async navigation compute settles.
		expect(wizard.canGoNext).toBe(false);

		createRoot((dispose) => {
			disposers.push(dispose);
			createEffect(() => {
				if (wizard.canGoNext) {
					throw new Error("navigation boom");
				}
			});
		});

		await flush();

		expect(wizard.canGoNext).toBe(true);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "navigation boom" }),
		);
	});

	it("E5: without onError, an isolated effect error is logged with console.error", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		try {
			const wizard = makeWizard();
			await flush();
			wizard.actions.updateField("name", "ada");

			createRoot((dispose) => {
				disposers.push(dispose);
				createEffect(() => {
					if (wizard.currentStepId === "plan") {
						throw new Error("unhandled boom");
					}
				});
			});

			await expect(wizard.goNext()).resolves.toBeUndefined();

			expect(consoleError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "unhandled boom" }),
			);
			expect(wizard.currentStepId).toBe("plan");
		} finally {
			consoleError.mockRestore();
		}
	});
});
