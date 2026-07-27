import type { WizardData } from "@gooonzick/wizard-core";
import { getContext, hasContext, setContext } from "svelte";
import type { WizardStore } from "./types";

const WIZARD_STORE_KEY = Symbol("gooonzick.wizard.store");

/** Must be called during component initialisation. Returns the same store. */
export function setWizardContext<T extends WizardData>(
	store: WizardStore<T>,
): WizardStore<T> {
	setContext(WIZARD_STORE_KEY, store);
	return store;
}

/**
 * Non-throwing probe. `hasContext()` throws outside component initialisation in
 * Svelte 5, so it is wrapped.
 */
export function hasWizardContext(): boolean {
	try {
		return hasContext(WIZARD_STORE_KEY);
	} catch {
		return false;
	}
}

/** @throws Error when no store was published by an ancestor. */
export function getWizardContext<T extends WizardData>(): WizardStore<T> {
	const store = getContext<WizardStore<T> | undefined>(WIZARD_STORE_KEY);
	if (!store) {
		throw new Error(
			"getWizardContext() must be called during the initialisation of a component " +
				"that has an ancestor calling setWizardContext(store).",
		);
	}
	return store;
}
