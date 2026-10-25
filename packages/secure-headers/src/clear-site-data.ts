import {
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	settle,
	withHeaders,
} from '@alxia/core';

/** A value of the `Clear-Site-Data` header, without its quotes. */
export type ClearSiteDataType =
	| 'cache'
	| 'cookies'
	| 'storage'
	| 'executionContexts'
	| 'clientHints'
	| 'prefetchCache'
	| 'prerenderCache'
	| '*';

export interface ClearSiteDataOptions {
	/** Defaults to `['POST']`: a GET to a sign-out URL clears nothing. */
	readonly methods?: readonly string[];
}

/**
 * What `clearSiteData()` returns: a middleware, for `app.use`, that adds
 * nothing to the context.
 */
export type ClearSiteData = Middleware<Empty, Promise<Response>>;

const TYPES: ReadonlySet<string> = new Set<ClearSiteDataType>([
	'cache',
	'cookies',
	'storage',
	'executionContexts',
	'clientHints',
	'prefetchCache',
	'prerenderCache',
	'*',
]);

/**
 * `Clear-Site-Data` on a 2xx or 3xx answer to one of `methods` (`POST` by
 * default). A refused request (another site's post, a 403, a failure) clears
 * nothing. Give it to `use(path, …)` for the sign-out path; React Router's
 * single fetch posts `.data` too, so mount both:
 *
 * ```ts
 * const cleared = clearSiteData(['cache']);
 * app.use('/sign-out', cleared).use('/sign-out.data', cleared);
 * ```
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
		if (!TYPES.has(type)) {
			throw new TypeError(
				`clearSiteData(): "${type}" is not a type: write one of ${[...TYPES].map((t) => `"${t}"`).join(', ')}`,
			);
		}
	}
	const value = types.map((type) => `"${type}"`).join(', ');
	const methods = new Set(
		(options.methods ?? ['POST']).map((method) => method.toUpperCase()),
	);
	return defineMiddleware(async function clearSiteData(ctx, next) {
		const response = await settle(ctx, next());
		if (!methods.has(ctx.request.method.toUpperCase())) return response;
		if (response.status < 200 || response.status >= 400) return response;
		return withHeaders(response, (headers) => {
			headers.set('clear-site-data', value);
		});
	});
}

markFactory(clearSiteData);
