import type { WizardPlugin } from "@gooonzick/wizard-core";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type { WizardStore } from "../../src/types";
import Conditional from "../fixtures/store-conditional.svelte";
import StoreWizard from "../fixtures/store-wizard.svelte";
import { flush } from "../helpers/flush";
import type { SignupData } from "../helpers/wizard";

describe("store layer in components", () => {
	it("B1: $wizard auto-subscription renders and re-renders", async () => {
		let wizard!: WizardStore<SignupData>;
		render(StoreWizard, {
			props: { onready: (w: WizardStore<SignupData>) => (wizard = w) },
		});

		expect(screen.getByTestId("step").textContent).toBe("personal");

		await flush();
		wizard.actions.updateField("name", "ada");
		await wizard.goNext();
		await tick();

		expect(screen.getByTestId("step").textContent).toBe("plan");
	});

	it("B2: bind:value on a field() store writes through updateField", async () => {
		let wizard!: WizardStore<SignupData>;
		const onDataChange = vi.fn();
		render(StoreWizard, {
			props: {
				onready: (w: WizardStore<SignupData>) => (wizard = w),
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

	it("B3: unmounting/remounting the only consumer does not destroy the wizard", async () => {
		let handle!: {
			wizard: WizardStore<SignupData>;
			setShow: (v: boolean) => void;
		};
		render(Conditional, {
			props: { onready: (h: typeof handle) => (handle = h) },
		});

		expect(screen.getByTestId("child-step").textContent).toBe("personal");

		handle.setShow(false);
		await tick();
		expect(screen.queryByTestId("child-step")).toBeNull();

		await flush();
		handle.wizard.actions.updateField("name", "ada");
		await handle.wizard.goNext();
		expect(handle.wizard.isDestroyed).toBe(false);

		handle.setShow(true);
		await tick();
		expect(screen.getByTestId("child-step").textContent).toBe("plan");
	});

	it("B4: unmounting the creating component tears plugins down", async () => {
		const destroy = vi.fn();
		const plugins: WizardPlugin<SignupData>[] = [{ name: "p", destroy }];
		const { unmount } = render(StoreWizard, { props: { plugins } });

		unmount();
		await flush();

		expect(destroy).toHaveBeenCalledTimes(1);
	});
});
