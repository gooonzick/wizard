import type {
	StepId,
	WizardData,
	WizardMachine,
	WizardState,
	WizardStepDefinition,
} from "@gooonzick/wizard-core";

/**
 * Subscription channels for fine-grained re-renders
 */
export type SubscriptionChannel =
	| "state"
	| "navigation"
	| "validation"
	| "loading"
	| "all";

/**
 * Navigation state computed from wizard machine
 */
export interface NavigationState {
	canGoNext: boolean;
	canGoPrevious: boolean;
	availableSteps: StepId[];
	isFirstStep: boolean;
	isLastStep: boolean;
	visitedSteps: StepId[];
	stepHistory: StepId[];
}

/**
 * Validation state slice
 */
export interface ValidationState {
	isValid: boolean;
	validationErrors?: Record<string, string>;
}

/**
 * Loading state slice (UI concerns managed by state manager, not core machine)
 */
export interface LoadingState {
	isValidating: boolean;
	isSubmitting: boolean;
	isNavigating: boolean;
}

/**
 * State snapshot interface for wizard state
 */
export interface StateSnapshot<T extends WizardData> {
	currentStepId: StepId;
	currentStep: WizardStepDefinition<T>;
	data: T;
	isCompleted: boolean;
}

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
	private subscribers: Map<SubscriptionChannel, Set<() => void>>;

	// Cached snapshots for useSyncExternalStore stability
	// These MUST return the same reference until state actually changes
	private stateCache: StateSnapshot<T>;
	private navigationCache: NavigationState;
	private validationCache: ValidationState;
	private loadingCache: LoadingState;

	// Promise for async navigation computation
	private navigationPromise: Promise<void> | null = null;

	// Initial step ID for isFirstStep calculation
	private initialStepId: StepId;

	constructor(machine: WizardMachine<T>, initialStepId: StepId) {
		this.machine = machine;
		this.initialStepId = initialStepId;

		// Initialize subscriber map for each channel
		this.subscribers = new Map([
			["state", new Set()],
			["navigation", new Set()],
			["validation", new Set()],
			["loading", new Set()],
			["all", new Set()],
		]);

		// Initialize loading state (UI concern, not from machine)
		this.loadingCache = {
			isValidating: false,
			isSubmitting: false,
			isNavigating: false,
		};

		// Initialize state cache
		const snapshot = this.machine.snapshot;
		this.stateCache = {
			currentStepId: snapshot.currentStepId,
			currentStep: this.machine.currentStep,
			data: snapshot.data,
			isCompleted: snapshot.isCompleted,
		};

		// Initialize validation cache
		this.validationCache = {
			isValid: snapshot.isValid,
			validationErrors: snapshot.validationErrors,
		};

		// Initialize navigation cache with safe defaults
		this.navigationCache = {
			canGoNext: false,
			canGoPrevious: false,
			availableSteps: [],
			isFirstStep: snapshot.currentStepId === this.initialStepId,
			isLastStep: true,
			visitedSteps: [...this.machine.visited],
			stepHistory: [...this.machine.history],
		};

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
		listener: () => void,
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
		const listenersToNotify = new Set<() => void>();

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
		const snapshot = this.machine.snapshot;
		this.stateCache = {
			currentStepId: snapshot.currentStepId,
			currentStep: this.machine.currentStep,
			data: snapshot.data,
			isCompleted: snapshot.isCompleted,
		};
	}

	/**
	 * Update validation cache from machine
	 */
	private updateValidationCache(): void {
		const snapshot = this.machine.snapshot;
		this.validationCache = {
			isValid: snapshot.isValid,
			validationErrors: snapshot.validationErrors,
		};
	}

	/**
	 * Update navigation cache with synchronous values only
	 */
	private updateNavigationCacheSync(): void {
		const snapshot = this.machine.snapshot;
		this.navigationCache = {
			...this.navigationCache,
			isFirstStep: snapshot.currentStepId === this.initialStepId,
			visitedSteps: [...this.machine.visited],
			stepHistory: [...this.machine.history],
		};
	}

	/**
	 * Get current machine snapshot
	 */
	getSnapshot(): WizardState<T> {
		return this.machine.snapshot;
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
	private async computeNavigationStateAsync(): Promise<void> {
		// If computation is already in progress, don't start another
		if (this.navigationPromise) {
			return;
		}

		this.navigationPromise = (async () => {
			try {
				const [nextStep, prevStep, available] = await Promise.all([
					this.machine.getNextStepId(),
					this.machine.getPreviousStepId(),
					this.machine.getAvailableSteps(),
				]);

				const machineSnapshot = this.machine.snapshot;

				const newNavigationState: NavigationState = {
					canGoNext: !!nextStep,
					canGoPrevious: !!prevStep,
					availableSteps: available,
					isFirstStep: machineSnapshot.currentStepId === this.initialStepId,
					isLastStep: !nextStep,
					visitedSteps: [...this.machine.visited],
					stepHistory: [...this.machine.history],
				};

				// Only update and notify if values actually changed
				if (
					this.navigationCache.canGoNext !== newNavigationState.canGoNext ||
					this.navigationCache.canGoPrevious !==
						newNavigationState.canGoPrevious ||
					this.navigationCache.isLastStep !== newNavigationState.isLastStep
				) {
					this.navigationCache = newNavigationState;
					this.navigationPromise = null;

					// Notify navigation subscribers that data is ready
					this.notifySubscribersForChannel("navigation");
				} else {
					this.navigationPromise = null;
				}
			} catch {
				this.navigationPromise = null;
			}
		})();
	}

	/**
	 * Notify only subscribers of a specific channel (without updating caches)
	 */
	private notifySubscribersForChannel(channel: SubscriptionChannel): void {
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
		this.loadingCache = { ...this.loadingCache, ...update };
		this.notifySubscribersForChannel("loading");
	}

	/**
	 * Get the underlying machine for direct access
	 */
	getMachine(): WizardMachine<T> {
		return this.machine;
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
	 * Handle state change from machine - determine affected channels
	 * @param newState New wizard state
	 * @param oldState Previous wizard state
	 */
	handleStateChange(newState: WizardState<T>, oldState: WizardState<T>): void {
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
