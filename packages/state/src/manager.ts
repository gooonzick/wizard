import type {
	StepId,
	WizardData,
	WizardMachine,
	WizardSerializedState,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";
import type {
	LoadingState,
	NavigationState,
	StateSnapshot,
	SubscriptionChannel,
	SubscriptionListener,
	TrackedLoadingFlag,
	ValidationState,
	WizardStateManagerOptions,
} from "./types";

/**
 * Manages shared wizard state and subscriptions for granular hooks
 * Supports channel-based subscriptions for fine-grained re-renders
 * Works standalone or can be used with provider
 *
 * IMPORTANT: All snapshot getters return cached values for useSyncExternalStore stability.
 * Caches are updated via handleStateChange() and setLoadingState().
 */
export class WizardStateManager<T extends WizardData> {
	private machine: WizardMachine<T>;
	private subscribers: Map<SubscriptionChannel, Set<SubscriptionListener>>;

	// Cached snapshots for useSyncExternalStore stability
	// These MUST return the same reference until state actually changes
	private stateCache: StateSnapshot<T>;
	private navigationCache: NavigationState;
	private validationCache: ValidationState;
	private loadingCache: LoadingState;
	// Per-flag reference counts for trackLoading(): a flag stays true while any
	// tracked operation holding it is in flight.
	private loadingCounts: Record<TrackedLoadingFlag, number> = {
		isValidating: 0,
		isSubmitting: 0,
		isNavigating: 0,
	};
	// Bumped whenever the flags are forced off (reset/restore/cancel). A tracked
	// operation that started in an older epoch was aborted by that force-off, so
	// its later release is ignored instead of stealing a newer operation's count.
	private loadingEpoch = 0;
	// Cached raw machine snapshot (FIX 12): same reference until state changes
	private snapshotCache: WizardState<T>;

	// Promise for async navigation computation
	private navigationPromise: Promise<void> | null = null;
	// Set when a recompute is requested while one is already in flight (M2):
	// triggers a single trailing recompute so nav state reflects the last edit.
	private navigationDirty = false;
	// Set by destroy(): short-circuits notify/compute so no async callback can
	// touch a torn-down manager.
	private destroyed = false;
	// The step the cached isLastStep/canGoNext belong to. Set on a sync seed
	// (constructor / step change) and when an async compute commits. A
	// same-step notify (data edit, validation, status change) keeps the cached
	// values instead of re-seeding them, so an async-proven value is not
	// knocked back to the conservative seed on every edit.
	private navigationSeedStepId: StepId;

	// Initial step ID for isFirstStep calculation
	private initialStepId: StepId;

	private options: WizardStateManagerOptions;

	// Last machine state seen, used as the `oldState` for
	// handleMachineStateChange(). Seeded from the machine in the constructor.
	private lastState: WizardState<T>;

	constructor(
		machine: WizardMachine<T>,
		initialStepId: StepId,
		options: WizardStateManagerOptions = {},
	) {
		this.machine = machine;
		this.initialStepId = initialStepId;
		this.options = options;

		// Initialize subscriber map for each channel
		this.subscribers = new Map([
			["state", new Set()],
			["navigation", new Set()],
			["validation", new Set()],
			["loading", new Set()],
			["all", new Set()],
		]);

		// Initialize state cache
		const snapshot = this.machine.snapshot;

		// Loading flags: the three UI flags start off; isLoadingStep mirrors the
		// machine, which may already be loading a lazy initial step (WIZ-013).
		this.loadingCache = {
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
			isLoadingStep: snapshot.isLoadingStep,
		};

		this.snapshotCache = snapshot;
		this.lastState = snapshot;
		this.stateCache = {
			currentStepId: snapshot.currentStepId,
			currentStep: this.machine.currentStep,
			data: snapshot.data,
			isCompleted: snapshot.isCompleted,
			stepStatuses: snapshot.stepStatuses,
			progress: snapshot.progress,
		};

		// Initialize validation cache
		this.validationCache = {
			isValid: snapshot.isValid,
			validationErrors: snapshot.validationErrors,
		};

		// Seed the navigation cache synchronously until the async recompute
		// settles. isLastStep/canGoNext come from core's conservative
		// `progress.isLastStep` (true only for a definitively terminal forward
		// path; false when a next step exists or can't be resolved sync), so a
		// UI labelling its primary button from this slice never flashes
		// "Finish" on a non-last step. The async compute overrides with the
		// authoritative values.
		this.navigationCache = {
			canGoNext: !snapshot.progress.isLastStep,
			canGoPrevious: false,
			canGoBack: snapshot.canGoBack,
			availableSteps: [],
			isFirstStep: snapshot.currentStepId === this.initialStepId,
			isLastStep: snapshot.progress.isLastStep,
			visitedSteps: [...this.machine.visited],
			stepHistory: [...this.machine.history],
		};
		this.navigationSeedStepId = snapshot.currentStepId;

		// Trigger async navigation computation
		this.computeNavigationStateAsync();
	}

	/**
	 * Subscribe to state changes with optional channel filter
	 * @param listener Callback function to invoke on state change
	 * @param channel Optional channel to subscribe to (defaults to 'all')
	 * @returns Unsubscribe function
	 */
	subscribe(
		listener: SubscriptionListener,
		channel: SubscriptionChannel = "all",
	): () => void {
		const channelSubscribers = this.subscribers.get(channel);
		if (channelSubscribers) {
			channelSubscribers.add(listener);
		}

		return () => {
			const subs = this.subscribers.get(channel);
			if (subs) {
				subs.delete(listener);
			}
		};
	}

	/**
	 * Notify subscribers of specific channels and update caches
	 * @param channels Array of channels that have changed
	 */
	notifySubscribers(channels: SubscriptionChannel[]): void {
		if (this.destroyed) return;
		// FIX 12: capture the machine snapshot ONCE per notify and refresh the
		// cached reference so getSnapshot() and the per-channel caches all read
		// the same object.
		this.snapshotCache = this.machine.snapshot;

		// Update caches for affected channels
		for (const channel of channels) {
			if (channel === "state") {
				this.updateStateCache();
			}
			if (channel === "navigation") {
				this.updateNavigationCacheSync();
				this.computeNavigationStateAsync();
			}
			if (channel === "validation") {
				this.updateValidationCache();
			}
			// Loading cache is updated via setLoadingState
		}

		// Collect all unique listeners to notify
		const listenersToNotify = new Set<SubscriptionListener>();

		// Add listeners from affected channels
		for (const channel of channels) {
			const channelSubs = this.subscribers.get(channel);
			if (channelSubs) {
				for (const listener of channelSubs) {
					listenersToNotify.add(listener);
				}
			}
		}

		// Always notify 'all' subscribers
		const allSubs = this.subscribers.get("all");
		if (allSubs) {
			for (const listener of allSubs) {
				listenersToNotify.add(listener);
			}
		}

		// Notify all collected listeners
		for (const listener of listenersToNotify) {
			listener();
		}
	}

	/**
	 * Update state cache from machine
	 */
	private updateStateCache(): void {
		const snapshot = this.snapshotCache;
		this.stateCache = {
			currentStepId: snapshot.currentStepId,
			currentStep: this.machine.currentStep,
			data: snapshot.data,
			isCompleted: snapshot.isCompleted,
			stepStatuses: snapshot.stepStatuses,
			progress: snapshot.progress,
		};
	}

	/**
	 * Update validation cache from machine
	 */
	private updateValidationCache(): void {
		const snapshot = this.snapshotCache;
		this.validationCache = {
			isValid: snapshot.isValid,
			validationErrors: snapshot.validationErrors,
		};
	}

	/**
	 * Update navigation cache with synchronous values only.
	 *
	 * When the current step differs from the step the cached values belong to,
	 * isLastStep/canGoNext are re-seeded from core's synchronous, conservative
	 * `progress.isLastStep` so they track the NEW step in the same notify
	 * (instead of carrying the previous step's values until the async
	 * recompute resolves). On the same step (data edits, validation, status
	 * changes) the previous values are kept and the async compute corrects
	 * them if needed — re-seeding there would flicker an async-proven
	 * `isLastStep: true` back to the conservative `false` on every edit.
	 * canGoPrevious/availableSteps always keep their last computed values.
	 */
	private updateNavigationCacheSync(): void {
		const snapshot = this.snapshotCache;
		const reseed = snapshot.currentStepId !== this.navigationSeedStepId;
		if (reseed) {
			this.navigationSeedStepId = snapshot.currentStepId;
		}
		this.navigationCache = {
			...this.navigationCache,
			canGoNext: reseed
				? !snapshot.progress.isLastStep
				: this.navigationCache.canGoNext,
			isLastStep: reseed
				? snapshot.progress.isLastStep
				: this.navigationCache.isLastStep,
			canGoBack: snapshot.canGoBack,
			isFirstStep: snapshot.currentStepId === this.initialStepId,
			visitedSteps: [...this.machine.visited],
			stepHistory: [...this.machine.history],
		};
	}

	/**
	 * Get current machine snapshot
	 */
	getSnapshot(): WizardState<T> {
		// FIX 12: return the cached reference (refreshed in notifySubscribers) so
		// the same object is returned until state changes — required for
		// useSyncExternalStore stability.
		return this.snapshotCache;
	}

	/**
	 * Get state snapshot for useWizardData hook
	 * Returns cached value for useSyncExternalStore stability
	 */
	getStateSnapshot(): StateSnapshot<T> {
		return this.stateCache;
	}

	/**
	 * Get current step definition
	 */
	getCurrentStep(): WizardStepDefinition<T> {
		return this.machine.currentStep;
	}

	/**
	 * Get navigation snapshot for useSyncExternalStore
	 * Returns cached value - async computation updates cache in background
	 */
	getNavigationSnapshot(): NavigationState {
		return this.navigationCache;
	}

	/**
	 * Compute navigation state asynchronously and notify subscribers when ready
	 */
	private computeNavigationStateAsync(): void {
		// If a compute is in flight, record that another recompute is needed
		// (M2): the trailing pass will run against live data once it finishes.
		if (this.navigationPromise) {
			this.navigationDirty = true;
			return;
		}
		// Never start work after teardown.
		if (this.destroyed) {
			return;
		}
		this.navigationDirty = false;

		// The step this compute's next/previous resolution belongs to.
		const computedForStepId = this.machine.snapshot.currentStepId;

		this.navigationPromise = (async () => {
			try {
				const [nextStep, prevStep, available] = await Promise.all([
					this.machine.getNextStepId(),
					this.machine.getPreviousStepId(),
					this.machine.getAvailableSteps(),
				]);

				if (this.destroyed) {
					return; // resolved after destroy(): drop, no commit / no notify
				}

				const machineSnapshot = this.machine.snapshot;

				// The step changed while resolving: these values describe the
				// previous step (e.g. a stale `isLastStep: true` after Back). Drop
				// them and let the trailing recompute resolve the current step.
				if (machineSnapshot.currentStepId !== computedForStepId) {
					this.navigationDirty = true;
					return;
				}

				const newNavigationState: NavigationState = {
					canGoNext: !!nextStep,
					canGoPrevious: !!prevStep,
					canGoBack: machineSnapshot.canGoBack,
					availableSteps: available,
					isFirstStep: machineSnapshot.currentStepId === this.initialStepId,
					isLastStep: !nextStep,
					visitedSteps: [...this.machine.visited],
					stepHistory: [...this.machine.history],
				};

				// Only update and notify if values actually changed. Compare ALL
				// semantic fields (M1): availableSteps/canGoBack are written only
				// here, so a boolean-only gate silently dropped their changes.
				if (
					!this.navigationStateEqual(this.navigationCache, newNavigationState)
				) {
					this.navigationCache = newNavigationState;
					this.navigationSeedStepId = computedForStepId;

					// Notify navigation subscribers that data is ready
					this.notifySubscribersForChannel("navigation");
				}
			} catch (error) {
				// A throwing user guard/resolver must not break the manager, but it
				// must not vanish either: report it (unless torn down meanwhile).
				if (!this.destroyed) {
					this.reportError(error);
				}
			} finally {
				this.navigationPromise = null;
				// Trailing recompute (M2): a request arrived while we were computing.
				if (this.navigationDirty && !this.destroyed) {
					this.navigationDirty = false;
					this.computeNavigationStateAsync();
				}
			}
		})();
	}

	/**
	 * Route an error the manager caught itself to `options.onError`, falling
	 * back to console.error. Never throws: callers run inside a detached
	 * promise, where a throw would become an unhandled rejection.
	 */
	private reportError(error: unknown): void {
		const err = error instanceof Error ? error : new Error(String(error));
		const { onError } = this.options;
		if (!onError) {
			console.error("[WizardStateManager] navigation computation failed:", err);
			return;
		}
		try {
			onError(err);
		} catch (callbackError) {
			console.error(
				"[WizardStateManager] onError handler threw:",
				callbackError,
			);
			console.error("[WizardStateManager] navigation computation failed:", err);
		}
	}

	/**
	 * Content equality for two navigation states. Arrays are compared by
	 * length + element (StepId is a string) — NOT by reference — because
	 * visitedSteps/stepHistory are freshly spread every compute, so a reference
	 * compare would always report "changed" and break useSyncExternalStore
	 * referential stability.
	 */
	private navigationStateEqual(
		a: NavigationState,
		b: NavigationState,
	): boolean {
		return (
			a.canGoNext === b.canGoNext &&
			a.canGoPrevious === b.canGoPrevious &&
			a.canGoBack === b.canGoBack &&
			a.isFirstStep === b.isFirstStep &&
			a.isLastStep === b.isLastStep &&
			this.stepIdsEqual(a.availableSteps, b.availableSteps) &&
			this.stepIdsEqual(a.visitedSteps, b.visitedSteps) &&
			this.stepIdsEqual(a.stepHistory, b.stepHistory)
		);
	}

	/**
	 * Order-significant content equality for two StepId arrays.
	 */
	private stepIdsEqual(a: StepId[], b: StepId[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	/**
	 * Notify only subscribers of a specific channel (without updating caches)
	 */
	private notifySubscribersForChannel(channel: SubscriptionChannel): void {
		if (this.destroyed) return;
		const channelSubs = this.subscribers.get(channel);
		if (channelSubs) {
			for (const listener of channelSubs) {
				listener();
			}
		}

		// Also notify 'all' subscribers
		const allSubs = this.subscribers.get("all");
		if (allSubs) {
			for (const listener of allSubs) {
				listener();
			}
		}
	}

	/**
	 * Get validation snapshot for useSyncExternalStore
	 * Returns cached value for stability
	 */
	getValidationSnapshot(): ValidationState {
		return this.validationCache;
	}

	/**
	 * Get loading snapshot for useSyncExternalStore
	 * Returns cached value for stability
	 */
	getLoadingSnapshot(): LoadingState {
		return this.loadingCache;
	}

	/**
	 * Update loading state and notify loading channel
	 */
	setLoadingState(update: Partial<LoadingState>): void {
		if (this.destroyed) return;
		this.loadingCache = { ...this.loadingCache, ...update };
		this.notifySubscribersForChannel("loading");
	}

	/**
	 * Run `fn` while holding a reference on the `flag` loading flag.
	 *
	 * Reference-counted: the flag turns on when the first tracked call starts and
	 * off only when the last one settles (resolved OR rejected), so overlapping
	 * operations — or one that is rejected immediately, e.g. a double-clicked
	 * Next rejected as busy — never clear another operation's flag early. The
	 * "loading" channel is notified only when the boolean actually changes.
	 *
	 * The flag is set synchronously, before `fn` is invoked. `fn`'s result is
	 * returned and its rejection propagates unchanged.
	 *
	 * runReset()/runRestore()/runCancel() force every flag off and discard all
	 * outstanding references; operations in flight at that moment release
	 * nothing when they later settle.
	 */
	async trackLoading<R>(
		flag: TrackedLoadingFlag,
		fn: () => Promise<R>,
	): Promise<R> {
		const epoch = this.loadingEpoch;
		this.loadingCounts[flag] += 1;
		this.setLoadingFlag(flag, true);
		try {
			return await fn();
		} finally {
			if (epoch === this.loadingEpoch) {
				this.loadingCounts[flag] = Math.max(0, this.loadingCounts[flag] - 1);
				if (this.loadingCounts[flag] === 0) {
					this.setLoadingFlag(flag, false);
				}
			}
		}
	}

	/**
	 * Set a single loading flag, notifying "loading" only on an actual change.
	 */
	private setLoadingFlag(flag: TrackedLoadingFlag, value: boolean): void {
		if (this.loadingCache[flag] === value) return;
		this.setLoadingState({ [flag]: value });
	}

	/**
	 * Drop every outstanding trackLoading() reference (zero the counters and
	 * start a new epoch). Does not touch the flags themselves.
	 */
	private discardLoadingRefs(): void {
		this.loadingEpoch += 1;
		this.loadingCounts = {
			isValidating: 0,
			isSubmitting: 0,
			isNavigating: 0,
		};
	}

	/**
	 * Force every loading flag off (always notifies, as before) and discard all
	 * trackLoading() references so aborted in-flight operations cannot drive a
	 * counter negative or clear a newer operation's flag when they settle.
	 */
	private forceLoadingOff(): void {
		this.discardLoadingRefs();
		this.setLoadingState({
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		});
	}

	/**
	 * Get the underlying machine for direct access
	 */
	getMachine(): WizardMachine<T> {
		return this.machine;
	}

	/**
	 * Tears down the wizard: delegates to the machine's destroy(), which runs
	 * every plugin's destroy() hook in reverse registration order. The machine
	 * isolates plugin-destroy rejections internally (routed to onError /
	 * console.error), so callers may fire-and-forget the returned promise.
	 */
	async destroy(): Promise<void> {
		this.destroyed = true;
		// Ignore any in-flight nav compute result (guarded inside the IIFE) and
		// stop further recompute scheduling.
		this.navigationPromise = null;
		this.navigationDirty = false;
		// Drop subscribers so no post-destroy notify can reach a listener.
		for (const set of this.subscribers.values()) {
			set.clear();
		}
		await this.machine.destroy();
	}

	/**
	 * Whether the underlying machine has been destroyed (plugins torn down).
	 * Terminal. Used by React entry points to detect a manager killed by the
	 * StrictMode mount->unmount->remount probe so it can be recreated.
	 */
	get isDestroyed(): boolean {
		return this.destroyed || this.machine.isDestroyed;
	}

	/**
	 * Reset the wizard to its initial state.
	 *
	 * Sets the loading flags + notifies "loading", calls the machine's
	 * synchronous reset(), then clears the loading flags + notifies "loading".
	 *
	 * The state/navigation/validation channels are notified automatically via the
	 * machine's onStateChange auto-routing (handleStateChange), so this method
	 * must NOT notify them manually to avoid double-notify.
	 */
	async runReset(data?: T): Promise<void> {
		this.forceLoadingOff();
		try {
			this.machine.reset(data);
		} finally {
			this.forceLoadingOff();
		}
	}

	/**
	 * Cancel the wizard.
	 *
	 * Sets isNavigating + notifies "loading", awaits the machine's cancel()
	 * (which always resets, then rejects if a cancel handler threw), then clears
	 * the loading flags + notifies "loading". Rejections from the machine
	 * propagate to the caller.
	 *
	 * The state/navigation/validation channels are notified automatically via the
	 * machine's onStateChange auto-routing.
	 */
	async runCancel(): Promise<void> {
		// machine.cancel() supersedes any in-flight transition immediately, so
		// release their references now: one settling while the cancel handlers
		// run must not clear the isNavigating flag cancel() is holding.
		this.discardLoadingRefs();
		this.setLoadingState({ isNavigating: true });
		try {
			await this.machine.cancel();
		} finally {
			this.forceLoadingOff();
		}
	}

	/**
	 * Restore the wizard from a serialized state.
	 *
	 * Sets the loading flags + notifies "loading", calls the machine's
	 * synchronous restore(), then clears the loading flags + notifies "loading".
	 *
	 * The state/navigation/validation channels are notified automatically via the
	 * machine's onStateChange auto-routing (restore emits sync + async-validate
	 * onStateChange).
	 */
	async runRestore(serializedState: WizardSerializedState<T>): Promise<void> {
		this.forceLoadingOff();
		try {
			this.machine.restore(serializedState);
		} finally {
			this.forceLoadingOff();
		}
	}

	/**
	 * Get visited steps from machine
	 */
	getVisitedSteps(): StepId[] {
		return this.machine.visited;
	}

	/**
	 * Get step history from machine
	 */
	getStepHistory(): StepId[] {
		return this.machine.history;
	}

	/**
	 * Entry point for the machine's `onStateChange` event: diffs `newState`
	 * against the last state this manager saw and routes the change to the
	 * affected channels. Bindings wire `events.onStateChange` straight to this
	 * (see createMachineAndManager) instead of tracking the previous state.
	 */
	handleMachineStateChange(newState: WizardState<T>): void {
		const previous = this.lastState;
		this.lastState = newState;
		this.handleStateChange(newState, previous);
	}

	/**
	 * Handle state change from machine - determine affected channels
	 * @param newState New wizard state
	 * @param oldState Previous wizard state
	 */
	handleStateChange(newState: WizardState<T>, oldState: WizardState<T>): void {
		// Keep lastState current for callers that still pass oldState themselves.
		this.lastState = newState;
		if (this.destroyed) return;
		const affected: SubscriptionChannel[] = [];

		// Data changes affect state, navigation, and validation
		if (newState.data !== oldState.data) {
			affected.push("state", "navigation", "validation");
		}

		// Step changes affect state and navigation
		if (newState.currentStepId !== oldState.currentStepId) {
			affected.push("state", "navigation");
		}

		// Completion affects state
		if (newState.isCompleted !== oldState.isCompleted) {
			affected.push("state");
		}

		// Validation changes affect validation channel
		if (
			newState.isValid !== oldState.isValid ||
			newState.validationErrors !== oldState.validationErrors
		) {
			affected.push("validation");
		}

		// Step status changes affect state; they also accompany history-only
		// changes (clearHistory), so refresh navigation too.
		if (newState.stepStatuses !== oldState.stepStatuses) {
			affected.push("state", "navigation");
		}

		// History-only changes (clearHistory(), restore() onto the same step)
		// leave data and currentStepId untouched, so check the navigation inputs
		// directly against the navigation cache.
		if (
			newState.canGoBack !== oldState.canGoBack ||
			!this.stepIdsEqual(
				this.machine.history,
				this.navigationCache.stepHistory,
			) ||
			!this.stepIdsEqual(
				this.machine.visited,
				this.navigationCache.visitedSteps,
			)
		) {
			affected.push("navigation");
		}

		// WIZ-013: isLoadingStep is owned by the machine. Mirror it into the
		// loading cache; when a lazy step finished loading in place (initial
		// step, after restore()) machine.currentStep changed identity, so the
		// state slice must pick up the merged definition too.
		if (newState.isLoadingStep !== oldState.isLoadingStep) {
			this.loadingCache = {
				...this.loadingCache,
				isLoadingStep: newState.isLoadingStep,
			};
			affected.push("loading");
			if (this.machine.currentStep !== this.stateCache.currentStep) {
				affected.push("state");
			}
		}

		if (affected.length > 0) {
			// Deduplicate channels
			const uniqueAffected = [...new Set(affected)];
			this.notifySubscribers(uniqueAffected);
		}
	}

	/**
	 * Get initial step ID
	 */
	getInitialStepId(): StepId {
		return this.initialStepId;
	}
}
