import type {
	StepId,
	WizardContext as WizardCoreContext,
	WizardData,
	WizardDefinition,
	WizardState,
} from "@gooonzick/wizard-core";
import {
	type DefineComponent,
	defineComponent,
	type InjectionKey,
	inject,
	provide,
	toRaw,
} from "vue";
import {
	useWizardActions,
	useWizardData,
	useWizardLoading,
	useWizardNavigation,
	useWizardValidation,
} from "./use-wizard-granular";
import type { UseWizardReturn } from "./types";
import { useWizard } from "./use-wizard";

/**
 * Context for granular hooks - holds the wizard instance
 */
interface WizardContextValue<T extends WizardData> {
	wizard: UseWizardReturn<T>;
}

// Injection key for type-safe provide/inject
const WizardInjectionKey: InjectionKey<WizardContextValue<WizardData>> =
	Symbol("wizard");

export interface WizardProviderProps<T extends WizardData> {
	definition: WizardDefinition<T>;
	initialData: T;
	context?: WizardCoreContext;
	onStateChange?: (state: WizardState<T>) => void;
	onStepEnter?: (stepId: StepId, data: T) => void;
	onStepLeave?: (stepId: StepId, data: T) => void;
	onComplete?: (data: T) => void;
	onError?: (error: Error) => void;
}

/**
 * Provider component for sharing wizard instance via provide/inject
 */
export const WizardProvider = defineComponent({
	name: "WizardProvider",
	props: {
		definition: {
			type: Object as () => WizardDefinition<WizardData>,
			required: true,
		},
		initialData: {
			type: Object as () => WizardData,
			required: true,
		},
		context: {
			type: Object as () => WizardCoreContext,
			default: () => ({}),
		},
		onStateChange: Function as unknown as () => (
			state: WizardState<WizardData>,
		) => void,
		onStepEnter: Function as unknown as () => (
			stepId: StepId,
			data: WizardData,
		) => void,
		onStepLeave: Function as unknown as () => (
			stepId: StepId,
			data: WizardData,
		) => void,
		onComplete: Function as unknown as () => (data: WizardData) => void,
		onError: Function as unknown as () => (error: Error) => void,
	},
	setup(props, { slots }) {
		// Use the main composable - this handles all machine management
		// Use toRaw to unwrap Vue's reactive proxies before passing to WizardMachine
		const wizard = useWizard({
			definition: toRaw(props.definition),
			initialData: toRaw(props.initialData),
			context: toRaw(props.context),
			onStateChange: props.onStateChange,
			onStepEnter: props.onStepEnter,
			onStepLeave: props.onStepLeave,
			onComplete: props.onComplete,
			onError: props.onError,
		});

		// Provide wizard context
		provide(WizardInjectionKey, { wizard });

		// Render default slot
		return () => slots.default?.();
	},
});

/**
 * Get wizard context (internal use for granular composables)
 * @throws {Error} if used outside of WizardProvider
 */
export function useWizardProviderContext<
	T extends WizardData,
>(): WizardContextValue<T> {
	const context = inject(WizardInjectionKey);
	if (!context) {
		throw new Error(
			"useWizardProviderContext must be used within WizardProvider",
		);
	}
	return context as unknown as WizardContextValue<T>;
}

/**
 * Creates a pre-typed provider component and granular composables for a specific data type.
 * This avoids `as any` casts at usage sites by returning already-typed versions.
 *
 * @example
 * ```ts
 * interface MyFormData extends WizardData {
 *   name: string;
 *   email: string;
 * }
 *
 * const {
 *   Provider,
 *   useData,
 *   useActions,
 *   useNavigation,
 *   useValidation,
 *   useLoading,
 * } = createTypedWizardProvider<MyFormData>();
 * ```
 */
export function createTypedWizardProvider<T extends WizardData>() {
	return {
		// Cast needed: Vue's defineComponent erases generics from props,
		// so we centralize the cast here instead of requiring `as any` at every usage site.
		Provider: WizardProvider as unknown as DefineComponent<
			WizardProviderProps<T>
		>,
		useData: () => useWizardData<T>(),
		useActions: () => useWizardActions<T>(),
		useNavigation: () => useWizardNavigation(),
		useValidation: () => useWizardValidation(),
		useLoading: () => useWizardLoading(),
	};
}
