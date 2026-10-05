/**
 * `originalUrl(ctx)`: the URL the client asked for, as the trusted proxies
 * in front of the app tell it, kept on the request's context under a
 * symbol shared by every copy of core.
 */
import type { Origin } from '../request/origin';

/** Where a request's context keeps the scheme and host the `proxy` option read. */
export const ORIGIN: unique symbol = Symbol.for('alxia.origin');

/**
 * The URL the client asked for: `ctx.url` with the scheme and the host a
 * trusted proxy said, under `alxia({ proxy: trustProxy(…) })`; each one
 * the proxy did not say, or said wrong, is the request's own. A copy:
 * changing it changes nothing on the request. What an absolute URL, a
 * redirect to another origin, or the choice of a `Secure` cookie reads.
 *
 * ```ts
 * const app = alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) }).get(
 *   '/login',
 *   (ctx) => ctx.reply(200, { callback: new URL('/callback', originalUrl(ctx)).href }),
 * );
 * ```
 */
export function originalUrl(ctx: { readonly url: URL }): URL {
	const url = new URL(ctx.url.href);
	const origin = (ctx as { [ORIGIN]?: Origin })[ORIGIN];
	if (origin?.protocol !== undefined) url.protocol = origin.protocol;
	if (origin?.host !== undefined) {
		url.hostname = origin.host.hostname;
		// The host setter keeps the old port when the new host names none.
		url.port = origin.host.port;
	}
	return url;
}
