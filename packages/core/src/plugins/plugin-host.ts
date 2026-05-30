import type { WizardError } from "../errors";
import { WizardConfigurationError } from "../errors";
import type {
	DeepReadonly,
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";

/** Reports an isolated hook throw back to the machine (which routes to onError).
 * The optional `phase` lets callers override the default "transition" phase used
 * by `handleError`. Lifecycle hooks (onComplete, onReset, destroy, onInit)
 * pass "lifecycle"; transition hooks leave it undefined (defaults to "transition").
 */
export type PluginErrorReporter = (
	error: unknown,
	phase?: "validation" | "transition" | "lifecycle" | "submit",
) => void;

/**
 * Owns the ordered plugin list and all hook dispatch logic. The machine holds
 * one PluginHost and injects an error reporter for isolated hook throws.
 *
 * Dispatch ordering: registration order, EXCEPT destroyAll which is reverse.
 */
export class PluginHost<TData> {
	private plugins: WizardPlugin<TData>[] = [];
	private destroyed = false;

	constructor(private readonly reportError: PluginErrorReporter) {}

	/** Registers a plugin. Throws on duplicate name or after destroyAll(). */
	add(plugin: WizardPlugin<TData>): void {
		if (this.destroyed) {
			throw new WizardConfigurationError(
				`Cannot add plugin "${plugin.name}" after the wizard has been destroyed`,
			);
		}
		if (this.plugins.some((p) => p.name === plugin.name)) {
			throw new WizardConfigurationError(
				`Plugin "${plugin.name}" is already registered`,
			);
		}
		this.plugins.push(plugin);
	}

	/** Removes a plugin by name, calling its destroy() first. No-op if absent. */
	async remove(name: string): Promise<void> {
		const index = this.plugins.findIndex((p) => p.name === name);
		if (index === -1) {
			return;
		}
		const [plugin] = this.plugins.splice(index, 1);
		await this.runIsolated(() => plugin.destroy?.(), "lifecycle");
	}

	/** Ordered (registration-order) snapshot of registered plugins. */
	list(): readonly WizardPlugin<TData>[] {
		return this.plugins;
	}

	/** Fire-and-forget onInit dispatch; rejections routed to the error reporter. */
	dispatchInit(view: WizardMachineReadonly<TData>): void {
		for (const plugin of this.plugins) {
			if (!plugin.onInit) {
				continue;
			}
			try {
				const result = plugin.onInit(view);
				if (result instanceof Promise) {
					result.catch((err) => this.reportError(err, "lifecycle"));
				}
			} catch (err) {
				this.reportError(err, "lifecycle");
			}
		}
	}

	/** Fire-and-forget onInit for a single (late-added) plugin. */
	dispatchInitOne(
		plugin: WizardPlugin<TData>,
		view: WizardMachineReadonly<TData>,
	): void {
		if (!plugin.onInit) {
			return;
		}
		try {
			const result = plugin.onInit(view);
			if (result instanceof Promise) {
				result.catch((err) => this.reportError(err, "lifecycle"));
			}
		} catch (err) {
			this.reportError(err, "lifecycle");
		}
	}

	/**
	 * Sequentially awaits each beforeTransition. Returns `false` as soon as a
	 * plugin vetoes (stops dispatching further). A THROW propagates to the caller
	 * (navigateToStep rethrows it; withTransition's catch reports it once).
	 */
	async dispatchBeforeTransition(e: TransitionEvent<TData>): Promise<boolean> {
		for (const plugin of this.plugins) {
			if (!plugin.beforeTransition) {
				continue;
			}
			const result = await plugin.beforeTransition(e);
			if (result === false) {
				return false;
			}
		}
		return true;
	}

	/** Isolated: each throw is reported; remaining plugins still run. */
	async dispatchAfterTransition(e: TransitionEvent<TData>): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.afterTransition?.(e));
		}
	}

	/** Isolated onComplete dispatch. */
	async dispatchComplete(data: DeepReadonly<TData>): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.onComplete?.(data), "lifecycle");
		}
	}

	/** Isolated onReset dispatch. */
	async dispatchReset(): Promise<void> {
		for (const plugin of this.plugins) {
			await this.runIsolated(() => plugin.onReset?.(), "lifecycle");
		}
	}

	/**
	 * Isolated onError dispatch. A throw INSIDE a plugin's onError is swallowed
	 * (at most console.error) — never re-routed, to prevent infinite recursion.
	 */
	async dispatchError(
		error: WizardError | Error,
		ctx: ErrorContext<TData>,
	): Promise<void> {
		for (const plugin of this.plugins) {
			if (!plugin.onError) {
				continue;
			}
			try {
				await plugin.onError(error, ctx);
			} catch (innerError) {
				// Swallow — do NOT re-route through reportError (no recursion).
				console.error(
					`[WizardMachine] plugin "${plugin.name}" onError threw`,
					innerError,
				);
			}
		}
	}

	/** Runs all plugins' destroy() in REVERSE registration order, isolated. No-op after the first call. */
	async destroyAll(): Promise<void> {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		const reversed = [...this.plugins].reverse();
		this.plugins = [];
		for (const plugin of reversed) {
			await this.runIsolated(() => plugin.destroy?.(), "lifecycle");
		}
	}

	/** Awaits a hook, catching + reporting any throw/rejection. */
	private async runIsolated(
		fn: () => void | Promise<void>,
		phase?: "validation" | "transition" | "lifecycle" | "submit",
	): Promise<void> {
		try {
			await fn();
		} catch (err) {
			this.reportError(err, phase);
		}
	}
}
