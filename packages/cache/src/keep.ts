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
 * Response directives that let a shared cache keep the answer to a request
 * carrying credentials (RFC 9111 §3.5).
 */
const SHARED = /\b(public|s-maxage|must-revalidate)\b/i;

/** Which request credentials the cache's key tells apart: a response to a request carrying one is someone's own otherwise. */
export interface KeyedBy {
	/** `vary` names `authorization`: each token is a key of its own. */
	readonly authorization: boolean;
	/** The app gave a `key`, or `vary` names `cookie`. */
	readonly cookie: boolean;
}

/**
 * Whether the answer to `request` may be kept for others. A request carrying
 * `Authorization` or `Cookie` is answered for whoever sent it: its response
 * is kept only when it says it may be shared — `public`, `s-maxage` or
 * `must-revalidate` — or when the key tells those senders apart (`keyedBy`).
 */
export function shareable(
	request: Request,
	response: Response,
	keyedBy: KeyedBy,
): boolean {
	const { headers } = request;
	const credentialed =
		(headers.has('authorization') && !keyedBy.authorization) ||
		(headers.has('cookie') && !keyedBy.cookie);
	return (
		!credentialed || SHARED.test(response.headers.get('cache-control') ?? '')
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
