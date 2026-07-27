import type { SubscriptionChannel } from "@gooonzick/wizard-state";
import type { Readable } from "svelte/store";

type Subscriber<V> = (value: V) => void;

interface ManagerLike {
	subscribe(listener: () => void, channel?: SubscriptionChannel): () => void;
}

/**
 * A hand-rolled Svelte store.
 *
 * We do NOT use `readable(value, start)` from `svelte/store` on purpose: its `start`
 * runs on the FIRST subscriber and its returned `stop` runs when the LAST one
 * unsubscribes. Any moment with zero subscribers ({#if} toggle, HMR swap, a component
 * that only reads the store inside an event handler) would tear the wizard down.
 * The manager subscription here is opened once and released only by `destroy()`.
 */
export function createChannelStore<V>(
	manager: ManagerLike,
	channel: SubscriptionChannel,
	read: () => V,
): Readable<V> {
	const subscribers = new Set<Subscriber<V>>();
	let unsubscribeFromManager: (() => void) | null = null;

	return {
		subscribe(run: Subscriber<V>) {
			subscribers.add(run);
			// The Svelte store contract REQUIRES a synchronous first emit.
			run(read());

			if (!unsubscribeFromManager) {
				unsubscribeFromManager = manager.subscribe(() => {
					const value = read();
					// Copy: a subscriber may unsubscribe during iteration.
					for (const subscriber of [...subscribers]) {
						subscriber(value);
					}
				}, channel);
			}

			return () => {
				subscribers.delete(run);
				// Deliberately no teardown on the last unsubscribe.
			};
		},
	};
}
