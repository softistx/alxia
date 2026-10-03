/** What a response must be to be kept, and what is kept of it. */
import { vary as addVary } from '@alxia/core';
import type { Control } from './control';
import type { CachedResponse } from './store';

/** Response headers that make a response someone's own. */
const PRIVATE = /\b(no-store|private)\b/i;

/**
 * Whether a response may be kept: not skipped, of a kept status, nobody's
 * own — no `no-store`, `private` or cookie — and not an event stream.
 */
export function keepable(
	response: Response,
	control: Control | undefined,
	statuses: ReadonlySet<number>,
): boolean {
	return !(
		control?.skipped ||
		!statuses.has(response.status) ||
		PRIVATE.test(response.headers.get('cache-control') ?? '') ||
		response.headers.has('set-cookie') ||
		response.headers.get('content-type')?.startsWith('text/event-stream')
	);
}

/**
 * The response as it is kept: its body read, `Content-Length` and `Date`
 * dropped, a weak `ETag` of its body when it has none, and `Vary` naming
 * each header in `vary`. `tags` is asked once the body is read.
 */
export async function toCached(
	response: Response,
	keep: {
		readonly ttl: number;
		readonly stale: number;
		readonly vary: readonly string[];
		readonly tags: () => string[];
	},
): Promise<CachedResponse> {
	const body = new Uint8Array(await response.arrayBuffer());
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	headers.delete('date');
	if (!headers.has('etag')) {
		headers.set('etag', `W/"${Bun.hash(body).toString(36)}"`);
	}
	for (const name of keep.vary) addVary(headers, name);
	return {
		status: response.status,
		headers: [...headers],
		body,
		storedAt: Date.now(),
		ttl: keep.ttl,
		stale: keep.stale,
		tags: keep.tags(),
	};
}
