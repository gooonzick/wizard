import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { Wizard } from "../../src/runes/types";
import RunesWizard from "../fixtures/runes-wizard.svelte";
import { flush } from "../helpers/flush";
import type { SignupData } from "../helpers/wizard";

describe("runes layer in components", () => {
	it("N1: re-renders on goNext()", async () => {
		let wizard!: Wizard<SignupData>;
		render(RunesWizard, {
			props: { onready: (w: Wizard<SignupData>) => (wizard = w) },
		});

		expect(screen.getByTestId("step").textContent).toBe("personal");

		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await tick();

		expect(screen.getByTestId("step").textContent).toBe("plan");
	});

	it("N2: bind:value={f.value} writes through updateField", async () => {
		let wizard!: Wizard<SignupData>;
		const onDataChange = vi.fn();
		render(RunesWizard, {
			props: {
				onready: (w: Wizard<SignupData>) => (wizard = w),
				onDataChange,
			},
		});

		const input = screen.getByTestId("input") as HTMLInputElement;
		await fireEvent.input(input, { target: { value: "bob" } });

		expect(onDataChange).toHaveBeenCalledTimes(1);
		expect(onDataChange.mock.calls[0][2]).toEqual(["name"]);
		expect(screen.getByTestId("name").textContent).toBe("bob");

		wizard.actions.updateField("name", "zed");
		await tick();

		expect(input.value).toBe("zed");
	});
});
