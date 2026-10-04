/**
 * The endpoint behind `graphql()`: one Yoga per path it is served at, and
 * the route handler that hands each request to it.
 */
import type { BaseContext, StatusCode } from '@alxia/core';
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
 * the route's context — the hooks' work, minus what a resolver has no use
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
		return reply(response.status as StatusCode, response.body ?? undefined, {
			headers,
		});
	};
}
