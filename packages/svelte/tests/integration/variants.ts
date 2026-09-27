import type { Component } from "svelte";
import RunesContextRegistration from "./fixtures/runes-context-registration.svelte";
import RunesRegistration from "./fixtures/runes-registration.svelte";
import StoreContextRegistration from "./fixtures/store-context-registration.svelte";
import StoreRegistration from "./fixtures/store-registration.svelte";

export interface Variant {
	name: string;
	Component: Component<Record<string, unknown>>;
}

/**
 * Every fixture renders the same markup and accepts the same props, so each
 * scenario runs against the classic store layer, the runes layer, and the
 * setWizardContext/getWizardContext split of both.
 */
export const variants: Variant[] = [
	{ name: "store (createWizardStore)", Component: StoreRegistration },
	{ name: "runes (createWizard)", Component: RunesRegistration },
	{ name: "store via context", Component: StoreContextRegistration },
	{ name: "runes via context", Component: RunesContextRegistration },
];
