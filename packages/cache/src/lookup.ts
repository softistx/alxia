/** Which requests the cache answers, and what a kept response is worth now. */
import type { CachedResponse } from './store';

/** Whether a request goes straight to the route: not a `GET` or `HEAD`, or a `no-cache` the cache honors. */
export function bypasses(
	request: Request,
	honorClientNoCache: boolean,
): boolean {
	if (request.method !== 'GET' && request.method !== 'HEAD') return true;
	return (
		honorClientNoCache &&
		/\bno-cache\b/i.test(request.headers.get('cache-control') ?? '')
	);
}

/** A kept response is `fresh` within its ttl, `stale` within its stale window after, and worth nothing beyond. */
export function freshness(
	found: CachedResponse,
	now: number = Date.now(),
): 'fresh' | 'stale' | undefined {
	const age = now - found.storedAt;
	if (age < found.ttl) return 'fresh';
	if (age < found.ttl + found.stale) return 'stale';
	return undefined;
}
