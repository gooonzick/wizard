import type { WizardData } from "@gooonzick/wizard-core";
import { getContext, hasContext, setContext } from "svelte";
import type { Wizard } from "./types";

// A distinct symbol from the store layer's key, so mixing the two layers in one
// component tree cannot cross-contaminate.
const WIZARD_RUNES_KEY = Symbol("gooonzick.wizard.runes");

/** Must be called during component initialisation. Returns the same wizard. */
export function setWizardContext<T extends WizardData>(
	wizard: Wizard<T>,
): Wizard<T> {
	setContext(WIZARD_RUNES_KEY, wizard);
	return wizard;
}

/**
 * Non-throwing probe. `hasContext()` throws outside component initialisation in
 * Svelte 5, so it is wrapped.
 */
export function hasWizardContext(): boolean {
	try {
		return hasContext(WIZARD_RUNES_KEY);
	} catch {
		return false;
	}
}

/** @throws Error when no wizard was published by an ancestor. */
export function getWizardContext<T extends WizardData>(): Wizard<T> {
	const wizard = getContext<Wizard<T> | undefined>(WIZARD_RUNES_KEY);
	if (!wizard) {
		throw new Error(
			"getWizardContext() must be called during the initialisation of a component " +
				"that has an ancestor calling setWizardContext(wizard).",
		);
	}
	return wizard;
}
