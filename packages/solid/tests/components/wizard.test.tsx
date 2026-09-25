import { fireEvent, render, screen } from "@solidjs/testing-library";
import { Match, Show, Switch } from "solid-js";
import { describe, expect, it } from "vitest";
import { createWizard, type Wizard } from "../../src/index";
import { flush } from "../helpers/flush";
import {
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
	it("M1: the Next button is disabled until navigation is computed", async () => {
		const wizard = createWizard<SignupData>({
			definition: createTestDefinition(),
			initialData,
		});
		render(() => <SignupForm wizard={wizard} />);
		const next = screen.getByRole("button", {
			name: "Next",
		}) as HTMLButtonElement;

		expect(next.disabled).toBe(true);
		await flush();
		expect(next.disabled).toBe(false);
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
