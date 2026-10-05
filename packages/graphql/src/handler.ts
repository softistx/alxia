/**
 * The endpoint behind `graphql()`: one Yoga per path it is served at, and
 * the route handler that hands each request to it.
 */
import { type BaseContext, type StatusCode, shutdownSignal } from '@alxia/core';
import {
	createYoga,
	type YogaServerInstance,
	type YogaServerOptions,
} from 'graphql-yoga';
import { renderSandbox, SANDBOX_POLICY, type SandboxOptions } from './sandbox';

export type YogaContext = Record<string, any>;

/** Where Yoga's GraphiQL page loads its files from: one pinned version on unpkg. */
const GRAPHIQL_FILES =
	/https:\/\/unpkg\.com\/@graphql-yoga\/graphiql@[\w.-]+\//;

/**
 * What GraphiQL's page may load: its scripts, styles and Monaco's
 * workers from the exact version of `@graphql-yoga/graphiql` the page
 * names, fetched and run as blobs; queries to this server alone; framed
 * by no one. A page that names none (a `renderGraphiQL` of the app's own)
 * gets this server alone. `@alxia/secure-headers` keeps a policy a
 * response already has.
 */
export function graphiqlPolicy(html: string): string {
	const files = html.match(GRAPHIQL_FILES)?.[0] ?? '';
	const from = files === '' ? '' : ` ${files}`;
	return [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${from}`,
		`style-src 'self' 'unsafe-inline'${from}`,
		"img-src 'self' data: https:",
		`font-src 'self' data:${from}`,
		"worker-src 'self' blob:",
		`connect-src 'self'${from}`,
		"frame-ancestors 'none'",
	].join('; ');
}

/**
 * The Yoga serving `endpoint`, created on first use. One per path: a plugin
 * mounted under a prefix serves the same routes at a longer path, and
 * GraphiQL must ask that one.
 */
export function yogaServers<UserCtx extends YogaContext>(
	options: Omit<YogaServerOptions<YogaContext, UserCtx>, 'graphqlEndpoint'>,
): (endpoint: string) => YogaServerInstance<YogaContext, UserCtx> {
	const servers = new Map<string, YogaServerInstance<YogaContext, UserCtx>>();
	return (endpoint) => {
		let yoga = servers.get(endpoint);
		if (yoga === undefined) {
			yoga = createYoga<YogaContext, UserCtx>({
				...options,
				graphqlEndpoint: endpoint,
			});
			servers.set(endpoint, yoga);
		}
		return yoga;
	};
}

/**
 * What Yoga is handed as its server context: the route's context — the
 * middlewares' work — minus what a resolver has no use for.
 */
export function serverContext(
	ctx: Record<string, unknown>,
): Record<string, unknown> {
	const {
		params: _params,
		query: _query,
		headers: _headers,
		cookies: _cookies,
		body: _body,
		reply: _reply,
		redirect: _redirect,
		...server
	} = ctx;
	return server;
}

/**
 * The handler of the endpoint's `GET` and `POST`: Apollo Sandbox's page to
 * a browser when `sandbox` is not `false`, else the request to Yoga, with
 * the route's context — the middlewares' work, minus what a resolver has no use
 * for — as Yoga's server context.
 */
export function graphqlHandler<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
	sandbox: SandboxOptions | false,
) {
	// A handler's context: its route is the one it was declared at. Named
	// `graphql`, the name the route table `listen` prints in dev shows.
	return async function graphql(
		ctx: Record<string, unknown> & BaseContext & { readonly route: string },
	) {
		const { reply } = ctx;
		const server = serverContext(ctx);
		if (
			sandbox !== false &&
			ctx.request.method === 'GET' &&
			ctx.request.headers.get('accept')?.includes('text/html') &&
			!ctx.url.searchParams.has('query')
		) {
			// A path: the page resolves it against its own address, so behind
			// a TLS proxy the Sandbox asks over https, as the browser did.
			return reply(200, renderSandbox(ctx.route, sandbox), {
				headers: {
					'content-type': 'text/html;charset=utf-8',
					'content-security-policy': SANDBOX_POLICY,
				},
			});
		}
		const response = await yogaAt(ctx.route).fetch(ctx.request, server);
		const headers = new Headers(response.headers);
		if (
			headers.get('content-type')?.startsWith('text/html') &&
			!headers.has('content-security-policy')
		) {
			// GraphiQL's page: its policy names the files it loads.
			const html = await response.text();
			headers.set('content-security-policy', graphiqlPolicy(html));
			return reply(response.status as StatusCode, html, { headers });
		}
		const body = endedOnShutdown(response, shutdownSignal(ctx));
		return reply(response.status as StatusCode, body ?? undefined, {
			headers,
		});
	};
}

/**
 * A subscription's or an incremental delivery's body, which streams until
 * its reader stops: ended when the app starts shutting down — Yoga's
 * stream cancelled, as when the client leaves, and the client reading its
 * end — so the drain does not wait for it. Any other body finishes within
 * the drain as it is.
 */
function endedOnShutdown(
	response: Response,
	signal: AbortSignal,
): ReadableStream<Uint8Array> | null {
	const body = response.body;
	const type = response.headers.get('content-type') ?? '';
	if (body === null || !/text\/event-stream|multipart\/mixed/.test(type)) {
		return body;
	}
	const reader = body.getReader();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const end = () => {
				void reader.cancel();
				try {
					controller.close();
				} catch {
					// Closed already: the stream had ended.
				}
			};
			if (signal.aborted) end();
			else signal.addEventListener('abort', end, { once: true });
		},
		async pull(controller) {
			const { value, done } = await reader.read();
			if (done) {
				try {
					controller.close();
				} catch {
					// Closed already: the shutdown ended it.
				}
				return;
			}
			controller.enqueue(value);
		},
		cancel: (reason) => reader.cancel(reason),
	});
}
