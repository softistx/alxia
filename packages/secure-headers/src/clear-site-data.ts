/**
 * `clearSiteData`: `Clear-Site-Data` on a successful, same-site sign-out, as a
 * middleware for the sign-out path.
 */
import {
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	settle,
	withHeaders,
} from '@alxia/core';

const TYPES = [
	'cache',
	'cookies',
	'storage',
	'executionContexts',
	'clientHints',
	'prefetchCache',
	'prerenderCache',
	'*',
] as const;

/** A value of the `Clear-Site-Data` header, without its quotes. */
export type ClearSiteDataType = (typeof TYPES)[number];

export interface ClearSiteDataOptions {
	/** Defaults to `['POST']`: a GET to a sign-out URL clears nothing. */
	readonly methods?: readonly string[];
	/**
	 * Also clear on a request another site made. Defaults to `false`: a
	 * request whose `Sec-Fetch-Site` is not `same-origin` or `none`, or whose
	 * `Origin` is not the request's own, clears nothing.
	 */
	readonly crossSite?: boolean;
	/**
	 * The origin a request must come from, such as `https://app.example.com`:
	 * required behind a TLS-terminating proxy, where the request's own URL
	 * says `http:`, for a browser that sends no `Sec-Fetch-Site`. A getter is
	 * read at each request. Else the request's own origin.
	 */
	readonly origin?: string | (() => string | undefined);
}

/**
 * What `clearSiteData()` returns: a middleware, for `app.use`, that adds
 * nothing to the context.
 */
export type ClearSiteData = Middleware<Empty, Promise<Response>>;

/** `"a", "b"`: each name quoted, as the header and the messages write them. */
function quoted(names: readonly string[]): string {
	return names.map((name) => `"${name}"`).join(', ');
}

/**
 * True when the request came from another site, as far as it says.
 * `Sec-Fetch-Site`, which the browser sets and a proxy leaves alone, decides
 * alone when present; else `Origin` is compared with the app's own.
 */
function isCrossSite(
	request: Request,
	own: string | (() => string | undefined) | undefined,
): boolean {
	const site = request.headers.get('sec-fetch-site');
	if (site !== null) return site !== 'same-origin' && site !== 'none';
	const origin = request.headers.get('origin');
	if (origin === null) return false;
	const set = typeof own === 'function' ? own() : own;
	return origin !== (set ?? new URL(request.url).origin);
}

/**
 * `Clear-Site-Data` on a 2xx or 3xx answer to one of `methods` (`POST` by
 * default). A request clears nothing when it is refused (a 403, a failure) or
 * when another site made it (`Sec-Fetch-Site` other than `same-origin` or
 * `none`; without that header, a foreign `Origin`), unless `crossSite` is `true`; a request
 * with neither header, such as curl's, is cleared. Give it to `use(path, …)` for the sign-out path; React Router's
 * single fetch posts `.data` too, so mount both:
 *
 * ```ts
 * const cleared = clearSiteData(['cache']);
 * app.use('/sign-out', cleared).use('/sign-out.data', cleared);
 * ```
 *
 * Throws a `TypeError` at declaration on an empty `types`, a type that is not
 * one of `ClearSiteDataType`, and an empty `methods` or an empty method name.
 */
export function clearSiteData(
	types: readonly ClearSiteDataType[],
	options: ClearSiteDataOptions = {},
): ClearSiteData {
	if (types.length === 0) {
		throw new TypeError(
			'clearSiteData(): no type is given: write at least one, such as ["cache"]',
		);
	}
	for (const type of types) {
		if (!(TYPES as readonly string[]).includes(type)) {
			throw new TypeError(
				`clearSiteData(): "${type}" is not a type: write one of ${quoted(TYPES)}`,
			);
		}
	}
	const value = quoted(types);
	const given = options.methods ?? ['POST'];
	if (given.length === 0 || given.some((method) => method === '')) {
		throw new TypeError(
			'clearSiteData(): methods is empty or holds an empty method: write at least one, such as ["POST"], or leave methods out',
		);
	}
	const methods = new Set(given.map((method) => method.toUpperCase()));
	const crossSite = options.crossSite === true;
	return defineMiddleware(async function clearSiteData(ctx, next) {
		const response = await settle(ctx, next());
		if (!methods.has(ctx.request.method)) return response;
		if (response.status < 200 || response.status >= 400) return response;
		if (!crossSite && isCrossSite(ctx.request, options.origin)) return response;
		return withHeaders(response, (headers) => {
			if (!headers.has('clear-site-data'))
				headers.set('clear-site-data', value);
		});
	});
}

markFactory(clearSiteData);
