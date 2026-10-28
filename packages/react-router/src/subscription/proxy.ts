import { isCrossSite } from '../errors/cross-site';
import { checkDocuments } from './documents';
import { readAsked } from './read';
import { problem, Refusal, refusalResponse, refusedUpstream } from './refusal';
import { relay } from './relay';

type HeaderValues = Record<string, string | null | undefined> | Headers;

/**
 * What React Router gives the resource route's `loader` and `action`, and what
 * `headers` receives beside the request: the route's `context` (the app's
 * `getLoadContext` value, `RouterContextProvider`) and `params`. Both are
 * optional so a call with the request alone, as in a spec, still type-checks.
 */
export interface SubscriptionArgs<Context = unknown> {
	readonly request: Request;
	readonly context?: Context;
	readonly params?: Readonly<Record<string, string | undefined>>;
}

export interface SubscriptionProxyOptions<Context = unknown> {
	/** The API's GraphQL endpoint, which serves subscriptions over SSE. */
	readonly endpoint: string | URL;
	/**
	 * The operations the browser may start: each name with the document the
	 * proxy sends upstream for it. The client names an operation and sends
	 * variables; its own `query` and `extensions` are ignored, so nothing it
	 * writes reaches the API. A name that is not a key is a 403.
	 */
	readonly allow: Readonly<Record<string, string>>;
	/** The session's token, from the request: `(request) => cookies.token(request)`. Empty is a 401. */
	readonly getToken: (
		request: Request,
	) => string | null | undefined | Promise<string | null | undefined>;
	/**
	 * Extra upstream headers (client name, proxy secret, `X-Forwarded-For`,
	 * `Accept-Language`), fixed or built per request. A `null` or `undefined`
	 * value is left out. A function gets the request and, as its second
	 * argument, the route's loader or action arguments (`context`, `params`), so
	 * it can send the trusted client address from the app's context instead of
	 * copying a header the browser could forge. They reach this function only,
	 * never the browser.
	 */
	readonly headers?:
		| HeaderValues
		| ((
				request: Request,
				args: SubscriptionArgs<Context>,
		  ) => HeaderValues | Promise<HeaderValues>);
	/** The app's own origin for the cross-site check, as `jsonActions` takes it; the request's own by default. */
	readonly origin?: string | (() => string | undefined);
	/** A comment line sent this often so a proxy or Bun's `idleTimeout` keeps the stream open. 15000 by default; `0` turns it off. */
	readonly heartbeatMs?: number;
	/** The `fetch` used upstream. The global one by default. */
	readonly fetch?: (request: Request) => Promise<Response>;
}

export interface SubscriptionProxy<Context = unknown> {
	/** A GET: graphql-sse's distinct connections mode, the operation in the search params. */
	loader(args: SubscriptionArgs<Context>): Promise<Response>;
	/** A POST: the operation in a JSON body. */
	action(args: SubscriptionArgs<Context>): Promise<Response>;
}

interface Config {
	readonly endpoint: URL;
	readonly documents: ReadonlyMap<string, string>;
	// `Context` is the caller's own claim about what its route passes and is never checked; `never` lets any typed `headers` function be stored.
	readonly options: SubscriptionProxyOptions<never>;
	readonly origin: () => string | undefined;
	readonly heartbeatMs: number;
	readonly upstreamFetch: (request: Request) => Promise<Response>;
}

const UNSAFE = /[\r\n\0]/;

async function upstreamHeaders(
	config: Config,
	args: SubscriptionArgs,
	token: string,
): Promise<Headers> {
	const { headers } = config.options;
	const extra =
		typeof headers === 'function'
			? await headers(args.request, args as SubscriptionArgs<never>)
			: headers;
	const out = new Headers();
	for (const [name, value] of extra instanceof Headers
		? extra.entries()
		: Object.entries(extra ?? {}))
		if (value !== null && value !== undefined) out.set(name, value);
	out.set('content-type', 'application/json');
	out.set('accept', 'text/event-stream');
	out.set('authorization', `Bearer ${token}`);
	return out;
}

async function handle(
	config: Config,
	args: SubscriptionArgs,
): Promise<Response> {
	const { request } = args;
	if (isCrossSite(request, config.origin()))
		return problem(403, 'Cross-site request refused.', 'FORBIDDEN');
	const token = await config.options.getToken(request);
	if (!token || UNSAFE.test(token))
		return problem(401, 'Sign in to continue.', 'UNAUTHENTICATED');

	let asked: Awaited<ReturnType<typeof readAsked>>;
	try {
		asked = await readAsked(request);
	} catch (error) {
		if (error instanceof Refusal) return refusalResponse(error);
		return problem(400, 'The request body could not be read.', 'BAD_REQUEST');
	}
	const query = config.documents.get(asked.operationName);
	if (query === undefined)
		return problem(403, 'This operation is not allowed.', 'FORBIDDEN');

	let headers: Headers;
	try {
		headers = await upstreamHeaders(config, args, token);
	} catch {
		return problem(
			500,
			"The proxy's upstream headers are not valid (a name or a value no header can hold, or the headers function threw).",
			'PROXY_MISCONFIGURED',
		);
	}

	const abort = new AbortController();
	if (request.signal.aborted) abort.abort();
	else
		request.signal.addEventListener('abort', () => abort.abort(), {
			once: true,
		});
	let upstream: Response;
	try {
		upstream = await config.upstreamFetch(
			new Request(config.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					query,
					operationName: asked.operationName,
					...(asked.variables === undefined
						? {}
						: { variables: asked.variables }),
				}),
				signal: abort.signal,
			}),
		);
	} catch {
		return problem(502, 'The API is unreachable.', 'UPSTREAM_ERROR');
	}
	const streaming =
		upstream.ok &&
		upstream.body !== null &&
		(upstream.headers.get('content-type') ?? '').startsWith(
			'text/event-stream',
		);
	if (streaming) return relay(upstream, abort, config.heartbeatMs);
	if (upstream.ok) {
		abort.abort();
		return problem(
			502,
			'The API did not answer with an event stream.',
			'UPSTREAM_ERROR',
		);
	}
	const refused = await refusedUpstream(upstream);
	abort.abort();
	return refused;
}

function only(
	method: string,
	run: (args: SubscriptionArgs) => Promise<Response>,
): (args: SubscriptionArgs) => Promise<Response> {
	return async (args) =>
		args.request.method === method
			? run(args)
			: problem(
					405,
					`Use ${method}.`,
					'METHOD_NOT_ALLOWED',
					{},
					{ allow: method },
				);
}

/**
 * A resource route that exposes GraphQL subscriptions to the browser without
 * giving it the API's token or a way to write its own document. See the
 * subscription guide.
 */
export function createSubscriptionProxy<Context = unknown>(
	options: SubscriptionProxyOptions<Context>,
): SubscriptionProxy<Context> {
	checkDocuments(options.allow);
	const config: Config = {
		endpoint: new URL(options.endpoint),
		documents: new Map(Object.entries(options.allow)),
		options: options as SubscriptionProxyOptions<never>,
		origin: () =>
			typeof options.origin === 'function' ? options.origin() : options.origin,
		heartbeatMs: options.heartbeatMs ?? 15000,
		upstreamFetch: options.fetch ?? ((request) => fetch(request)),
	};
	return {
		loader: only('GET', (args) => handle(config, args)),
		action: only('POST', (args) => handle(config, args)),
	};
}
