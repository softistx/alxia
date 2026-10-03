import type { CachedResponse } from './store';

/** What a run of the route gives: a response it kept, or its own when it kept nothing. */
export type Loaded = { kept: CachedResponse } | { own: Response };

/**
 * Runs the route once for every concurrent miss of a key. Only a response
 * that is kept is shared: one that is not — private, skipped, a cookie,
 * another status — answers the request that ran the route, and every other
 * waiting request runs the route itself, through its own `next`.
 */
export function singleFlight() {
	/** The run of each key being loaded: what it kept, or `undefined` when it kept nothing. */
	const loading = new Map<string, Promise<CachedResponse | undefined>>();
	return {
		/** Whether a run of `key` is under way. */
		has: (key: string): boolean => loading.has(key),
		load(
			key: string,
			run: () => Promise<Loaded>,
			next: () => Promise<Response>,
		): Promise<CachedResponse | Response> {
			const running = loading.get(key);
			if (running !== undefined) {
				return running.then(
					(cached): Promise<CachedResponse | Response> | CachedResponse =>
						cached ?? next(),
					(): Promise<CachedResponse | Response> => next(),
				);
			}
			const ran = run();
			const shared = ran.then((loaded) =>
				'kept' in loaded ? loaded.kept : undefined,
			);
			loading.set(key, shared);
			shared.finally(() => loading.delete(key)).catch(() => {});
			return ran.then((loaded) =>
				'kept' in loaded ? loaded.kept : loaded.own,
			);
		},
	};
}

/**
 * A stale response's refresh, run behind it: the route's own error is its to
 * log, and a response it does not keep is read by no one.
 */
export function refreshBehind(
	loading: Promise<CachedResponse | Response>,
): void {
	loading
		.then((loaded) =>
			loaded instanceof Response ? loaded.body?.cancel() : undefined,
		)
		.catch((error) => console.error(error));
}
