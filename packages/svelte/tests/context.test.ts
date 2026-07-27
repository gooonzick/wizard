import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { getWizardContext, hasWizardContext } from "../src/context";
import ContextChild from "./fixtures/store-context-child.svelte";
import ContextParent from "./fixtures/store-context-parent.svelte";

describe("context helpers", () => {
	it("X1: getWizardContext() throws when nothing was published", () => {
		// Outside component initialisation Svelte itself refuses the call.
		expect(() => getWizardContext()).toThrow();

		// Inside a component with no ancestor publishing a store we throw our own
		// descriptive error.
		expect(() => render(ContextChild)).toThrow(/setWizardContext/);
	});

	it("X2: hasWizardContext() returns false outside a component", () => {
		expect(hasWizardContext()).toBe(false);
	});

	it("X3: a child reads the store published by its parent", () => {
		render(ContextParent);

		expect(screen.getByTestId("child-step").textContent).toBe("personal");
	});
});
