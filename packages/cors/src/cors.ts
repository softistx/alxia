import {
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	settle,
	vary,
	withHeaders,
} from '@alxia/core';

/** Which origins may call: every one, a list, a pattern, or a decision per origin. */
export type CorsOrigin =
	| true
	| string
	| readonly (string | RegExp)[]
	| RegExp
	| ((origin: string) => boolean);

export interface CorsOptions {
	/**
	 * The origins allowed. `true`, the default, allows every one: with
	 * `credentials`, the request's origin is echoed back, since `*` cannot
	 * carry them.
	 */
	readonly origin?: CorsOrigin;
	/** The methods a preflight allows. Every method but `CONNECT` and `TRACE` by default. */
	readonly methods?: readonly string[];
	/** The request headers a preflight allows. By default, those the browser asks for. */
	readonly allowedHeaders?: readonly string[];
	/** The response headers a script may read, beyond the safelisted ones. */
	readonly exposedHeaders?: readonly string[];
	/** Whether cookies and `Authorization` go with a cross-origin call. */
	readonly credentials?: boolean;
	/** How long, in seconds, a browser may keep a preflight's answer. */
	readonly maxAge?: number;
	/** Answers Chrome's Private Network Access preflight. */
	readonly privateNetwork?: boolean;
}

/** What `cors()` makes: a middleware that adds nothing to the context. */
export type CorsMiddleware = Middleware<Empty, Promise<Response>>;

const METHODS = [
	'GET',
	'HEAD',
	'PUT',
	'PATCH',
	'POST',
	'DELETE',
	'OPTIONS',
	'QUERY',
];

/**
 * CORS, as a middleware: a preflight is answered with a 204, whatever its
 * path, and every response to an allowed origin carries its headers — a
 * 404's and an error's included. Give it to `use` first: a request no
 * route matches, a preflight's among them, runs it wherever it stands,
 * and a route runs it when declared after it.
 *
 * ```ts
 * const app = alxia().use(cors({ origin: ['https://app.example.com'], credentials: true }));
 * ```
 */
export function cors(options: CorsOptions = {}): CorsMiddleware {
	const allows = matcher(options.origin ?? true);
	const methods = (options.methods ?? METHODS).join(', ');
	const exposed = options.exposedHeaders?.join(', ');

	/** The `Access-Control-Allow-Origin` an origin gets, or none. */
	const allowOrigin = (origin: string | null): string | undefined => {
		if (options.origin === undefined || options.origin === true) {
			if (!options.credentials) return '*';
			return origin ?? undefined;
		}
		if (origin === null) return undefined;
		try {
			return allows(origin) ? origin : undefined;
		} catch (error) {
			// An `origin` function that throws costs the headers, never the
			// response: a preflight's 204 and a route's answer alike.
			console.error(error);
			return undefined;
		}
	};

	const common = (headers: Headers, origin: string | null) => {
		const allowed = allowOrigin(origin);
		if (allowed !== '*') vary(headers, 'Origin');
		if (allowed === undefined) return false;
		headers.set('access-control-allow-origin', allowed);
		if (options.credentials) {
			headers.set('access-control-allow-credentials', 'true');
		}
		return true;
	};

	/** The answer to a preflight: a 204, with what the origin may do. */
	const preflight = (request: Request): Response => {
		const headers = new Headers();
		if (common(headers, request.headers.get('origin'))) {
			headers.set('access-control-allow-methods', methods);
			const requested = request.headers.get('access-control-request-headers');
			const allowedHeaders = options.allowedHeaders?.join(', ') ?? requested;
			if (allowedHeaders) {
				headers.set('access-control-allow-headers', allowedHeaders);
			}
			if (options.allowedHeaders === undefined) {
				vary(headers, 'Access-Control-Request-Headers');
			}
			if (options.maxAge !== undefined) {
				headers.set('access-control-max-age', String(options.maxAge));
			}
			if (
				options.privateNetwork &&
				request.headers.get('access-control-request-private-network') === 'true'
			) {
				headers.set('access-control-allow-private-network', 'true');
			}
		}
		return new Response(null, { status: 204, headers });
	};

	return defineMiddleware(async function cors(ctx, next) {
		const { request } = ctx;
		if (
			request.method === 'OPTIONS' &&
			request.headers.has('access-control-request-method')
		) {
			return preflight(request);
		}
		const response = await settle(ctx, next());
		const origin = request.headers.get('origin');
		if (origin === null && allowOrigin(null) !== '*') return response;
		return withHeaders(response, (headers) => {
			if (common(headers, origin) && exposed) {
				headers.set('access-control-expose-headers', exposed);
			}
		});
	});
}

function matcher(origin: CorsOrigin): (origin: string) => boolean {
	if (origin === true) return () => true;
	if (typeof origin === 'string') return (candidate) => candidate === origin;
	if (origin instanceof RegExp) return (candidate) => origin.test(candidate);
	if (typeof origin === 'function') return origin;
	return (candidate) =>
		origin.some((allowed) =>
			typeof allowed === 'string'
				? allowed === candidate
				: allowed.test(candidate),
		);
}

markFactory(cors);
