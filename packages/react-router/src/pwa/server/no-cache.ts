import { defineMiddleware, withHeaders } from '@alxia/core';

/**
 * The service worker's own policy: a worker takes the policy its script
 * came with, not the pages'. It runs no other script and fetches this site
 * only (the precache, navigations); its routes never fetch another origin.
 */
export const WORKER_POLICY = "default-src 'none'; connect-src 'self'";

/**
 * The worker's script with `Cache-Control: no-cache`: the client's
 * top-level files are served for an hour, and the worker's script must be
 * revalidated on every update check, or an update waits that long. And with
 * the worker's policy (`WORKER_POLICY`, or your own `policy`), which no
 * other static file needs: none of them is a document but an offline page,
 * which carries its own in a `<meta>`.
 */
export function revalidated(
	response: Response,
	policy: string = WORKER_POLICY,
): Response {
	return withHeaders(response, (headers) => {
		headers.set('cache-control', 'no-cache');
		headers.set('content-security-policy', policy);
	});
}

/**
 * For `use(SERVICE_WORKER_URL, noCache)` in `createServer({ beforeAll })`,
 * before the client's files: they answer without calling `next` for a
 * middleware declared after them.
 */
export const noCache = defineMiddleware(async (_ctx, next) =>
	revalidated(await next()),
);
