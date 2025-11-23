import type {
	StepId,
	WizardData,
	WizardMachine,
	WizardState,
	WizardStepDefinition,
} from "@wizard/core";

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
 * Loading state slice
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
 * Manages shared wizard state for Vue composables
 * Provides caching and channel-based subscription mechanism for reactive updates
 *
 * IMPORTANT: All snapshot getters return cached values for stability.
 * Caches are updated via handleStateChange() and setLoadingState().
 */
export class WizardStateManager<T extends WizardData> {
	private machine: WizardMachine<T>;
	private subscribers: Map<SubscriptionChannel, Set<() => void>>;

	// Cached snapshots for stability
	private stateCache: StateSnapshot<T>;
	private navigationCache: NavigationState;
	private validationCache: ValidationState;
	private loadingCache: LoadingState;

	// Promise for async navigation computation
	private navigationPromise: Promise<void> | null = null;

	// Initial step ID for isFirstStep calculation
	private initialStepId: StepId;

	constructor(machine: WizardMachine<T>) {
		this.machine = machine;
		this.initialStepId = machine.snapshot.currentStepId;

		// Initialize subscriber map for each channel
		this.subscribers = new Map([
			["state", new Set()],
			["navigation", new Set()],
			["validation", new Set()],
			["loading", new Set()],
			["all", new Set()],
		]);

		// Initialize loading state
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
	 * Get current machine snapshot
	 */
	getSnapshot(): WizardState<T> {
		return this.machine.snapshot;
	}

	/**
	 * Get current step definition
	 */
	getCurrentStep(): WizardStepDefinition<T> {
		return this.machine.currentStep;
	}

	/**
	 * Get state snapshot for caching
	 */
	getStateSnapshot(): StateSnapshot<T> {
		return this.stateCache;
	}

	/**
	 * Get navigation snapshot
	 */
	getNavigationSnapshot(): NavigationState {
		return this.navigationCache;
	}

	/**
	 * Get validation snapshot
	 */
	getValidationSnapshot(): ValidationState {
		return this.validationCache;
	}

	/**
	 * Get loading snapshot
	 */
	getLoadingSnapshot(): LoadingState {
		return this.loadingCache;
	}

	/**
	 * Compute navigation state with promise memoization (async)
	 *
	 * This method uses promise memoization to prevent race conditions when
	 * called concurrently. Multiple simultaneous calls will share the same
	 * promise, ensuring only one computation happens at a time.
	 *
	 * @returns Navigation state including canGoNext, canGoPrevious, and availableSteps
	 */
	async getNavigationState(): Promise<NavigationState> {
		// Ensure we have the latest async values
		await this.computeNavigationStateAsync();
		return this.navigationCache;
	}

	/**
	 * Compute navigation state asynchronously and notify subscribers when ready
	 */
	private async computeNavigationStateAsync(): Promise<void> {
		// If computation is already in progress, wait for it
		if (this.navigationPromise) {
			return this.navigationPromise;
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

		return this.navigationPromise;
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
	notifySubscribers(channels?: SubscriptionChannel[]): void {
		const affectedChannels = channels || ["all"];

		// Update caches for affected channels
		for (const channel of affectedChannels) {
			if (channel === "state" || channel === "all") {
				this.updateStateCache();
			}
			if (channel === "navigation" || channel === "all") {
				this.updateNavigationCacheSync();
				this.computeNavigationStateAsync();
			}
			if (channel === "validation" || channel === "all") {
				this.updateValidationCache();
			}
			// Loading cache is updated via setLoadingState
		}

		// Collect all unique listeners to notify
		const listenersToNotify = new Set<() => void>();

		// Add listeners from affected channels
		for (const channel of affectedChannels) {
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
	 * Notify only subscribers of a specific channel
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
	 * Update loading state and notify loading channel
	 */
	setLoadingState(update: Partial<LoadingState>): void {
		this.loadingCache = { ...this.loadingCache, ...update };
		this.notifySubscribersForChannel("loading");
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
	 * Get initial step ID
	 */
	getInitialStepId(): StepId {
		return this.initialStepId;
	}
}
