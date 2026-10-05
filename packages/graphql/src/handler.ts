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

/**
 * What GraphiQL loads: Yoga's page from unpkg, and queries to this server.
 * `@alxia/secure-headers` keeps a policy a response already has.
 */
const GRAPHIQL_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://unpkg.com",
	"style-src 'self' 'unsafe-inline' https://unpkg.com",
	"img-src 'self' data: https:",
	"font-src 'self' data: https:",
	"worker-src 'self' blob:",
	"connect-src 'self'",
].join('; ');

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
 * The handler of the endpoint's `GET` and `POST`: Apollo Sandbox's page to
 * a browser when `sandbox` is not `false`, else the request to Yoga, with
 * the route's context — the middlewares' work, minus what a resolver has no use
 * for — as Yoga's server context.
 */
export function graphqlHandler<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
	sandbox: SandboxOptions | false,
) {
	// A handler's context: its route is the one it was declared at.
	return async (
		ctx: Record<string, unknown> & BaseContext & { readonly route: string },
	) => {
		const {
			params: _params,
			query: _query,
			headers: _headers,
			cookies: _cookies,
			body: _body,
			reply,
			redirect: _redirect,
			...server
		} = ctx;
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
			headers.set('content-security-policy', GRAPHIQL_POLICY);
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
