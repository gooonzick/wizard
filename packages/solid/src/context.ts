import type { WizardData } from "@gooonzick/wizard-core";
import { createComponent, createContext, type JSX, useContext } from "solid-js";
import type { Wizard } from "./types";

// One context for every Wizard<T>; useWizardContext<T>() narrows it.
// biome-ignore lint/suspicious/noExplicitAny: the context value is generic per call site
const WizardContext = createContext<Wizard<any> | undefined>(undefined);

export interface WizardProviderProps<T extends WizardData> {
	/** An existing wizard from `createWizard()`. Read once; the provider never destroys it. */
	wizard: Wizard<T>;
	children?: JSX.Element;
}

/**
 * Publishes an existing wizard to descendants. Written with `createComponent`
 * (no JSX) so the package ships as plain TypeScript.
 */
export function WizardProvider<T extends WizardData>(
	props: WizardProviderProps<T>,
): JSX.Element {
	return createComponent(WizardContext.Provider, {
		value: props.wizard,
		get children() {
			return props.children;
		},
	});
}

/** @throws Error when no ancestor rendered `<WizardProvider wizard={...}>`. */
export function useWizardContext<T extends WizardData>(): Wizard<T> {
	const wizard = useContext(WizardContext);
	if (!wizard) {
		throw new Error(
			"useWizardContext() must be called inside a <WizardProvider wizard={...}>.",
		);
	}
	return wizard as Wizard<T>;
}

/** Non-throwing probe; `useContext` returns the default outside a provider or owner. */
export function hasWizardContext(): boolean {
	return useContext(WizardContext) !== undefined;
}
