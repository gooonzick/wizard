import { WizardRestoreError } from "../errors";
import type { WizardSerializedState } from "../machine/wizard-machine";
import type { WizardMachineReadonly, WizardPlugin } from "./types";

/** JSON-safe envelope actually handed to / returned by an adapter. */
export interface PersistedWizardSnapshot<TData> {
	/** Envelope format version, owned by the library. Currently always 1. */
	envelope: 1;
	/** App-controlled schema version (PersistencePluginConfig.version, default 1). */
	version: number;
	/** Date.now() at write time; used with `maxAgeMs`. */
	savedAt: number;
	/** The machine's own serialized state (carries its own `version: 1`). */
	state: WizardSerializedState<TData>;
}

/**
 * Storage backend contract. Async-first: every method may return a value OR a
 * promise, so localStorage, IndexedDB and server adapters share one interface.
 *
 * Error contract:
 * - `load()` returns `null` when nothing is stored. It may throw/reject for a
 *   genuine failure (unreadable/corrupt payload) — the plugin catches it, reports
 *   `onRestoreError` and starts the wizard clean.
 * - `save()` / `clear()` may throw/reject (quota, network) — the plugin catches and
 *   reports `onSaveError`. Writes are never retried.
 * - The returned value is treated as UNTRUSTED: the plugin re-validates the
 *   envelope and delegates deep validation to `machine.restore()`.
 */
export interface WizardPersistenceAdapter<TData> {
	load():
		| PersistedWizardSnapshot<TData>
		| null
		| Promise<PersistedWizardSnapshot<TData> | null>;
	save(snapshot: PersistedWizardSnapshot<TData>): void | Promise<void>;
	clear(): void | Promise<void>;
}

/** Why a stored snapshot was intentionally NOT applied. */
export type PersistenceSkipReason =
	/** restoreOnInit: false */
	| "disabled"
	/** the facade exposes no serialize/restore (hand-rolled view) */
	| "unsupported"
	/** the adapter returned null/undefined */
	| "empty"
	/** envelope.version !== config.version */
	| "version-mismatch"
	/** maxAgeMs exceeded */
	| "expired"
	/** the snapshot was isCompleted and clearOnComplete is on */
	| "completed"
	/** the wizard already moved on / was busy by the time the load resolved */
	| "stale"
	/** the plugin was destroyed or superseded before the load resolved */
	| "destroyed";

/** Result of the plugin's single restore attempt. */
export type PersistenceRestoreOutcome<TData> =
	| { status: "restored"; state: WizardSerializedState<TData> }
	| { status: "skipped"; reason: PersistenceSkipReason }
	| { status: "failed"; error: Error };

export interface PersistencePluginConfig<TData> {
	/** REQUIRED storage backend. */
	adapter: WizardPersistenceAdapter<TData>;
	/** Plugin name (must be unique per machine). Default: "persistence". */
	name?: string;
	/** Read + apply a stored snapshot in onInit. Default: true. */
	restoreOnInit?: boolean;
	/** Trailing-edge debounce for data-change writes, ms. Default: 300. 0 = next microtask. */
	debounceMs?: number;
	/** App-controlled schema version written into / checked against the envelope. Default: 1. */
	version?: number;
	/** Discard snapshots older than this many ms. Default: undefined (never expire). */
	maxAgeMs?: number;
	/** Save after every committed transition. Default: true. */
	saveOnTransition?: boolean;
	/** Save (debounced) after every data change. Default: true. */
	saveOnDataChange?: boolean;
	/** Clear the record when the wizard completes (and refuse completed snapshots). Default: true. */
	clearOnComplete?: boolean;
	/** Clear the record on reset()/cancel(). Default: true. */
	clearOnReset?: boolean;
	/** Register a `pagehide` listener that flushes pending writes. Default: false. */
	flushOnUnload?: boolean;
	/** Last chance to redact/transform before writing. Return null to skip this write. */
	beforeSave?(
		state: WizardSerializedState<TData>,
	): WizardSerializedState<TData> | null;
	/** A snapshot was successfully applied to the machine. */
	onRestored?(state: WizardSerializedState<TData>): void;
	/** A snapshot was intentionally NOT applied. */
	onRestoreSkipped?(reason: PersistenceSkipReason): void;
	/** Load/parse/validate/restore failed. `raw` is the untrusted adapter value (may be undefined). */
	onRestoreError?(error: Error, raw: unknown): void;
	/** A save() or clear() failed. */
	onSaveError?(error: Error): void;
}

/** A WizardPlugin augmented with imperative persistence controls. */
export type PersistencePlugin<TData> = WizardPlugin<TData> & {
	/**
	 * Outcome of the restore attempt of the LATEST `onInit`. NEVER rejects.
	 * Each `onInit` whose predecessor attempt already settled (e.g. a React
	 * StrictMode re-init or a remount re-using a hoisted plugin instance) re-arms
	 * this with a fresh promise, so read it AFTER the machine was constructed /
	 * `use()` returned — a reference captured earlier may reflect a previous
	 * machine (e.g. `{ skipped: "destroyed" }`).
	 */
	readonly ready: Promise<PersistenceRestoreOutcome<TData>>;
	/** Cancels the debounce and drains any pending write. Resolves when the adapter settles. */
	flush(): Promise<void>;
	/** Cancels the debounce, drops any pending save and clears the stored record. */
	clear(): Promise<void>;
};

type MachineView<TData> = WizardMachineReadonly<TData>;

type EventTargetLike = {
	addEventListener?: (type: string, handler: () => void) => void;
	removeEventListener?: (type: string, handler: () => void) => void;
};

/**
 * Built-in state persistence (WIZ-006). Restores a stored snapshot in `onInit`,
 * then auto-saves — debounced on data changes, immediately after every committed
 * transition — and clears the record on completion / reset.
 *
 * The plugin drives the machine through the OPTIONAL `serialize` / `restore` /
 * `isBusy` members of `WizardMachineReadonly`; against a facade that lacks them it
 * degrades to inert (`ready` settles `{ skipped: "unsupported" }`) instead of throwing.
 *
 * `onInit` never throws and never returns a promise, so a persistence failure is
 * NEVER routed into the machine's error channel or other plugins' `onError`; it is
 * surfaced only through `onRestoreError` / `onSaveError` (or a single console.warn
 * per category when neither is supplied).
 *
 * With a synchronous adapter the restore is applied inside `onInit`, i.e. before
 * `use()` / the `WizardMachine` constructor returns. With an asynchronous adapter
 * there is no ordering guarantee, so a late load is DISCARDED when the wizard has
 * moved on, is busy, or the plugin was destroyed/superseded — never force-applied.
 * `await plugin.ready` (read after the machine / `use()` call — it re-arms per
 * `onInit`) to observe the outcome.
 */
export function createPersistencePlugin<TData>(
	config: PersistencePluginConfig<TData>,
): PersistencePlugin<TData> {
	const {
		adapter,
		name = "persistence",
		restoreOnInit = true,
		debounceMs = 300,
		version = 1,
		maxAgeMs,
		saveOnTransition = true,
		saveOnDataChange = true,
		clearOnComplete = true,
		clearOnReset = true,
		flushOnUnload = false,
	} = config;

	let machine: MachineView<TData> | null = null;
	let initSeq = 0;
	let destroyed = false;
	let movedOn = false; // the wizard advanced past its initial state
	let inert = false; // completed + cleared: ignore further saves
	let restorePending = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pendingOp: "save" | "clear" | null = null;
	let queue: Promise<void> = Promise.resolve();
	let warnedRestore = false;
	let warnedSave = false;
	let unloadHandler: (() => void) | null = null;

	// `ready` is a per-onInit deferred: onInit re-arms it (a fresh, unsettled
	// promise) whenever the current one has already settled, so a re-used plugin
	// instance (React StrictMode probe, a remount with a hoisted plugin) reports
	// the NEW machine's restore outcome. It never rejects.
	type Deferred = {
		promise: Promise<PersistenceRestoreOutcome<TData>>;
		resolve: (o: PersistenceRestoreOutcome<TData>) => void;
		settled: boolean;
	};
	const createDeferred = (): Deferred => {
		let resolve!: (o: PersistenceRestoreOutcome<TData>) => void;
		const promise = new Promise<PersistenceRestoreOutcome<TData>>((res) => {
			resolve = res;
		});
		return { promise, resolve, settled: false };
	};
	let deferred = createDeferred();
	const settleOnce = (o: PersistenceRestoreOutcome<TData>): void => {
		if (deferred.settled) return;
		deferred.settled = true;
		deferred.resolve(o);
	};

	const toError = (e: unknown): Error =>
		e instanceof Error ? e : new Error(String(e));
	const isPromise = (v: unknown): v is Promise<unknown> =>
		typeof (v as { then?: unknown } | null | undefined)?.then === "function";

	/** Invoke a user callback; never let it escape. */
	function safe(
		fn: (() => void) | undefined,
		onThrow?: (e: Error) => void,
	): void {
		if (!fn) return;
		try {
			fn();
		} catch (err) {
			onThrow?.(toError(err));
		}
	}

	function reportRestoreError(err: unknown, raw: unknown): void {
		const e = toError(err);
		if (config.onRestoreError) {
			try {
				config.onRestoreError(e, raw);
			} catch {
				/* no recursion: mirrors PluginHost.dispatchError */
			}
			return;
		}
		if (!warnedRestore) {
			warnedRestore = true;
			console.warn(`[wizard:persistence] restore failed: ${e.message}`);
		}
	}

	function reportSaveError(err: unknown): void {
		const e = toError(err);
		if (config.onSaveError) {
			try {
				config.onSaveError(e);
			} catch {
				/* no recursion */
			}
			return;
		}
		if (!warnedSave) {
			warnedSave = true;
			console.warn(`[wizard:persistence] save failed: ${e.message}`);
		}
	}

	function skip(reason: PersistenceSkipReason): void {
		safe(
			() => config.onRestoreSkipped?.(reason),
			(e) => reportRestoreError(e, undefined),
		);
		settleOnce({ status: "skipped", reason });
	}

	// ── write queue ──────────────────────────────────────────────────
	// Single-slot coalescing queue with a serialized tail: no adapter call ever
	// overlaps another and the last scheduled op wins. The chain never rejects.
	function buildSnapshot(): PersistedWizardSnapshot<TData> | null {
		const m = machine;
		if (!m?.serialize) return null;
		const state = m.serialize();
		const finalState = config.beforeSave ? config.beforeSave(state) : state;
		if (!finalState) return null;
		return { envelope: 1, version, savedAt: Date.now(), state: finalState };
	}

	function drain(): Promise<void> {
		queue = queue.then(async () => {
			while (pendingOp !== null) {
				const op = pendingOp;
				pendingOp = null; // claim before awaiting
				if (op === "clear") {
					try {
						await adapter.clear();
					} catch (err) {
						reportSaveError(err);
					}
					continue;
				}
				let payload: PersistedWizardSnapshot<TData> | null = null;
				try {
					// serialize + beforeSave run HERE so the write always reflects the
					// newest state — never a payload captured at schedule time.
					payload = buildSnapshot();
				} catch (err) {
					reportSaveError(err);
					continue;
				}
				if (payload === null) continue; // no machine, or beforeSave returned null
				try {
					await adapter.save(payload);
				} catch (err) {
					reportSaveError(err);
				}
			}
		});
		return queue;
	}

	function cancelTimer(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function schedule(op: "save" | "clear", immediate: boolean): void {
		if (destroyed) return;
		pendingOp = op;
		cancelTimer();
		if (restorePending) return; // suppressed until the in-flight load settles
		if (immediate || debounceMs <= 0) {
			void drain();
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			void drain();
		}, debounceMs);
	}

	/** Clear that bypasses `destroyed`/debounce (used by the restore failure paths). */
	function hardClear(): Promise<void> {
		cancelTimer();
		pendingOp = "clear";
		return drain();
	}

	// ── unload listener ──────────────────────────────────────────────
	function unregisterUnload(): void {
		if (!unloadHandler) return;
		const g = globalThis as EventTargetLike;
		if (typeof g.removeEventListener === "function") {
			g.removeEventListener("pagehide", unloadHandler);
		}
		unloadHandler = null;
	}

	function registerUnload(): void {
		// Always drop the previous handler first: a StrictMode re-init must not leak
		// listeners.
		unregisterUnload();
		if (!flushOnUnload) return;
		const g = globalThis as EventTargetLike;
		if (typeof g.addEventListener !== "function") return;
		unloadHandler = (): void => {
			cancelTimer();
			void drain();
		};
		g.addEventListener("pagehide", unloadHandler);
	}

	// ── restore ──────────────────────────────────────────────────────
	function applyLoaded(raw: unknown, seq: number): void {
		if (seq !== initSeq) {
			// Superseded by a newer onInit: that init owns `restorePending`, the
			// pending writes and the current `ready` deferred — touch none of them.
			safe(
				() => config.onRestoreSkipped?.("destroyed"),
				(e) => reportRestoreError(e, undefined),
			);
			return;
		}
		restorePending = false;
		const m = machine;
		if (destroyed || !m) {
			skip("destroyed");
			return;
		}
		try {
			if (raw === null || raw === undefined) {
				skip("empty");
				return;
			}
			const env = raw as PersistedWizardSnapshot<TData>;
			if (
				typeof env !== "object" ||
				env.envelope !== 1 ||
				typeof env.state !== "object" ||
				env.state === null
			) {
				throw new WizardRestoreError(
					"Persisted wizard snapshot envelope is malformed",
				);
			}
			if (env.version !== version) {
				void hardClear();
				skip("version-mismatch");
				return;
			}
			if (
				maxAgeMs !== undefined &&
				typeof env.savedAt === "number" &&
				Date.now() - env.savedAt > maxAgeMs
			) {
				void hardClear();
				skip("expired");
				return;
			}
			if (env.state.isCompleted && clearOnComplete) {
				void hardClear();
				skip("completed");
				return;
			}
			if (movedOn || m.isBusy === true) {
				skip("stale");
				return;
			}
			if (!m.restore) {
				skip("unsupported");
				return;
			}
			m.restore(env.state); // may throw WizardRestoreError
			safe(
				() => config.onRestored?.(env.state),
				(e) => reportRestoreError(e, raw),
			);
			settleOnce({ status: "restored", state: env.state });
		} catch (err) {
			reportRestoreError(err, raw);
			void hardClear(); // drop the poison record
			settleOnce({ status: "failed", error: toError(err) });
		} finally {
			if (pendingOp !== null) void drain(); // release suppressed writes
		}
	}

	return {
		name,
		get ready(): Promise<PersistenceRestoreOutcome<TData>> {
			return deferred.promise;
		},

		flush(): Promise<void> {
			cancelTimer();
			return drain();
		},

		clear(): Promise<void> {
			return hardClear();
		},

		onInit(view: WizardMachineReadonly<TData>): void {
			// Full re-arm: React StrictMode re-onInits the SAME instance on a NEW machine.
			destroyed = false;
			movedOn = false;
			inert = false;
			restorePending = false;
			cancelTimer();
			pendingOp = null;
			// Re-arm `ready` only when the previous attempt already settled; an
			// unsettled deferred is simply carried over to this init.
			if (deferred.settled) {
				deferred = createDeferred();
			}
			machine = view;
			const seq = ++initSeq;
			registerUnload(); // idempotent; no-op unless flushOnUnload
			if (!restoreOnInit) {
				skip("disabled");
				return;
			}
			if (
				typeof view.serialize !== "function" ||
				typeof view.restore !== "function"
			) {
				skip("unsupported");
				return;
			}
			let loaded: unknown;
			try {
				loaded = adapter.load();
			} catch (err) {
				reportRestoreError(err, undefined);
				settleOnce({ status: "failed", error: toError(err) });
				return;
			}
			if (isPromise(loaded)) {
				restorePending = true;
				loaded.then(
					(v) => applyLoaded(v, seq),
					(err) => {
						reportRestoreError(err, undefined);
						// A superseded init's late rejection must not release the
						// current init's write suppression or settle its `ready`.
						if (seq !== initSeq) return;
						restorePending = false;
						settleOnce({ status: "failed", error: toError(err) });
						if (pendingOp !== null) void drain();
					},
				);
				return; // MUST return void, not the promise
			}
			applyLoaded(loaded, seq);
		},

		beforeTransition(): undefined {
			movedOn = true;
			return undefined;
		},

		afterTransition(): void {
			movedOn = true;
			if (inert || !saveOnTransition) return;
			schedule("save", true);
		},

		onDataChange(): void {
			movedOn = true;
			if (inert || !saveOnDataChange) return;
			schedule("save", false);
		},

		onComplete(): void {
			movedOn = true;
			if (clearOnComplete) {
				inert = true;
				schedule("clear", true);
			} else {
				schedule("save", true);
			}
		},

		onReset(): void {
			movedOn = true;
			inert = false;
			cancelTimer();
			pendingOp = null; // DROP the pre-reset payload
			schedule(clearOnReset ? "clear" : "save", true);
		},

		destroy(): void | Promise<void> {
			destroyed = true;
			cancelTimer();
			unregisterUnload();
			settleOnce({ status: "skipped", reason: "destroyed" });
			if (pendingOp === null) return; // never write speculatively
			return drain(); // bypasses the `destroyed` guard in schedule()
		},
	};
}
