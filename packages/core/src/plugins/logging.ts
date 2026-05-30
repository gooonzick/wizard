import type { WizardError } from "../errors";
import type {
	ErrorContext,
	TransitionEvent,
	WizardMachineReadonly,
	WizardPlugin,
} from "./types";

type LogLevel = "debug" | "info" | "warn";
type Logger = Pick<Console, "log" | "warn" | "debug">;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2 };

/**
 * Reference plugin: a pure observer that logs every hook. Never vetoes, never
 * throws. Doubles as the canonical "how to write a plugin" example.
 */
export function createLoggingPlugin<TData>(config?: {
	level?: LogLevel;
	logger?: Logger;
}): WizardPlugin<TData> {
	const level: LogLevel = config?.level ?? "debug";
	const logger: Logger = config?.logger ?? console;

	/** Emit only if the configured level rank is low enough to show this line. */
	function verbose(msg: string): void {
		if (LEVEL_RANK[level] <= LEVEL_RANK.debug) {
			logger.debug(msg);
		} else if (LEVEL_RANK[level] <= LEVEL_RANK.info) {
			logger.log(msg);
		}
		// "warn" level suppresses all verbose lines
	}

	return {
		name: "logging",
		onInit(machine: WizardMachineReadonly<TData>): void {
			verbose(
				`[wizard:logging] init @ step "${machine.snapshot.currentStepId}"`,
			);
		},
		beforeTransition(e: TransitionEvent<TData>): undefined {
			verbose(
				`[wizard:logging] beforeTransition (${e.type}) ${e.fromStepId} -> ${e.toStepId}`,
			);
			return undefined;
		},
		afterTransition(e: TransitionEvent<TData>): void {
			verbose(
				`[wizard:logging] afterTransition (${e.type}) ${e.fromStepId} -> ${e.toStepId}`,
			);
		},
		onComplete(): void {
			verbose("[wizard:logging] complete");
		},
		onReset(): void {
			verbose("[wizard:logging] reset");
		},
		onError(error: WizardError | Error, ctx: ErrorContext<TData>): void {
			// Errors are always surfaced at warn level.
			logger.warn(
				`[wizard:logging] error in phase "${ctx.phase}" @ step "${ctx.stepId}": ${error.message}`,
			);
		},
		destroy(): void {
			verbose("[wizard:logging] destroy");
		},
	};
}
