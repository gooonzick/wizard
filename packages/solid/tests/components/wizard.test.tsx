import { fireEvent, render, screen } from "@solidjs/testing-library";
import { Match, Show, Switch } from "solid-js";
import { describe, expect, it } from "vitest";
import { createWizard, type Wizard } from "../../src/index";
import { flush } from "../helpers/flush";
import {
	createAsyncTerminalDefinition,
	createTestDefinition,
	initialData,
	type SignupData,
} from "../helpers/wizard";

function SignupForm(props: { wizard: Wizard<SignupData> }) {
	const name = props.wizard.field("name");
	return (
		<div>
			<Switch>
				<Match when={props.wizard.currentStepId === "personal"}>
					<input
						aria-label="Name"
						value={name.value}
						onInput={(e) => {
							name.value = e.currentTarget.value;
						}}
					/>
					<Show when={props.wizard.validationErrors?.name}>
						{(message) => <p role="alert">{message()}</p>}
					</Show>
				</Match>
				<Match when={props.wizard.currentStepId === "plan"}>
					<p>Plan step</p>
				</Match>
			</Switch>
			<button
				type="button"
				disabled={!props.wizard.canGoNext || props.wizard.isNavigating}
				onClick={() => {
					void props.wizard.goNext().catch(() => {});
				}}
			>
				Next
			</button>
		</div>
	);
}

describe("rendered component", () => {
	it("M1: the Next button tracks the sync seed, then the async navigation compute", async () => {
		// Linear first step: enabled from the very first render (sync seed).
		const linear = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		const first = render(() => <SignupForm wizard={linear} />);
		const linearNext = screen.getByRole("button", {
			name: "Next",
		}) as HTMLButtonElement;
		expect(linearNext.disabled).toBe(false);
		await flush();
		expect(linearNext.disabled).toBe(false);
		first.unmount();

		// Async resolver returning null: enabled from the seed, disabled once the
		// async compute learns there is no next step.
		const resolver = createWizard<SignupData>({
			definition: createAsyncTerminalDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={resolver} />);
		const next = screen.getByRole("button", {
			name: "Next",
		}) as HTMLButtonElement;

		expect(next.disabled).toBe(false);
		await flush();
		expect(next.disabled).toBe(true);
	});

	it("M2: an invalid click shows the validation error and stays on the step", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		await flush();

		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Name is required",
		);
		expect(screen.getByLabelText("Name")).toBeTruthy();
	});

	it("M3: typing binds through field() and Next swaps the step", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		await flush();

		fireEvent.input(screen.getByLabelText("Name"), {
			target: { value: "ada" },
		});
		expect(wizard.data.name).toBe("ada");

		fireEvent.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Plan step")).toBeTruthy();
		expect(wizard.currentStepId).toBe("plan");
	});
});
