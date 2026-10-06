/**
 * The whole of a request: routing, then the route's own run or the
 * socket's upgrade.
 */

import { routeAt } from '../router/router';
import { failed } from './answers';
import { handle, unmatched } from './boundary';
import type { Definition, Runtime } from './definition';
import { ORIGIN } from './original-url';
import { SERVED } from './served';
import { UPGRADED, upgradeSocket } from './socket';
import type { RequestContext } from './types';
import { untrustedProxy } from './untrusted-proxy';

/**
 * The whole of a request: the route it reaches, or the answer to one that
 * reaches none, behind the app's middlewares. What escapes them all — a
 * bug in the router — is a logged 500.
 */
export async function serve(
	runtime: Runtime,
	request: Request,
	server: Bun.Server<unknown> | undefined,
	path: string | undefined,
): Promise<Response> {
	const ctx = {
		request,
		url: new URL(request.url),
		server,
		ip: undefined,
		route: undefined,
		error: undefined,
		[SERVED]: runtime.served,
		[ORIGIN]: undefined,
	} as RequestContext;
	try {
		// Reading the address runs the app's code (a `trusted` function, an
		// `ip` option): a throw there lands at the boundary, on a context that
		// holds nothing the request said.
		const forwarded = runtime.proxy?.(request, server);
		Object.assign(ctx, {
			ip: forwarded === undefined ? runtime.ip(request, server) : forwarded.ip,
			[ORIGIN]: forwarded?.origin,
		});
		if (forwarded?.refused === true)
			return await untrustedProxy(ctx, forwarded.refusal, forwarded.answer);
		const response = await route(runtime, ctx, path);
		return response === UPGRADED ? (undefined as never) : response;
	} catch (error) {
		return failed(error, ctx);
	}
}

/** What the router finds for `method`: a route, or the methods its path allows. */
type Found =
	| { readonly value: Definition; readonly params: Record<string, string> }
	| { readonly path: string; readonly allowed: readonly string[] }
	| undefined;

/**
 * The route `method` reaches at `url`: matched by the router, or at
 * `path`, the one `Bun.serve` chose under `listen`.
 */
function found(
	{ router, globals }: Runtime,
	url: URL,
	path: string | undefined,
	method: string,
): Found {
	if (path === undefined) {
		const pages = globals.pages.size === 0 ? undefined : globals.pages.keys();
		return router.match(method, url.pathname, pages);
	}
	const methods = router.methodsAt(path);
	if (methods === undefined) return undefined;
	const value = routeAt(methods, method);
	if (value !== undefined) {
		return { value, params: router.paramsAt(path, url.pathname) };
	}
	return { path, allowed: [...methods.keys()] };
}

/**
 * The route the request reached, run: the socket a `websocket` upgrade
 * asks for, a `GET` for a `HEAD` no `HEAD` route takes, before the path's
 * `all` route, or the 404, 405 or 426
 * when none answers, behind the app's chain (`unmatched`) — a 405's and a
 * 426's behind the chains of the routes at its path too.
 */
async function route(
	runtime: Runtime,
	ctx: RequestContext,
	path: string | undefined,
): Promise<Response | typeof UPGRADED> {
	const { router, globals } = runtime;
	const { request } = ctx;
	const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
	const find = (method: string) => found(runtime, ctx.url, path, method);

	if (upgrade) {
		const socket = find('WS');
		if (
			socket !== undefined &&
			'value' in socket &&
			socket.value.kind === 'ws'
		) {
			(ctx as { route: string | undefined }).route = socket.value.path;
			return upgradeSocket(
				socket.value,
				ctx,
				socket.params,
				globals.parsers,
				runtime.validateResponses,
			);
		}
	}
	let match = find(request.method);
	if (request.method === 'HEAD' && match !== undefined && 'allowed' in match) {
		const get = find('GET');
		if (get !== undefined && 'value' in get) match = get;
	}
	if (match === undefined) return unmatched(runtime, ctx, 404);
	if ('allowed' in match) {
		// What tells the path's methods runs behind the chains of its routes.
		const owners = router.methodsAt(match.path)?.values();
		const allowed = match.allowed.filter((method) => method !== 'WS');
		if (allowed.length === 0) {
			return unmatched(runtime, ctx, 426, undefined, owners);
		}
		return unmatched(runtime, ctx, 405, allowed, owners);
	}
	const definition = match.value;
	(ctx as { route: string | undefined }).route = definition.path;
	if (definition.kind === 'ws') return unmatched(runtime, ctx, 426);
	const response = await handle(
		definition,
		ctx,
		match.params,
		globals,
		runtime.validateResponses,
	);
	// A `HEAD` the `GET` or the `all` route answered is sent without a body,
	// which is cancelled: a proxied upstream's stream is released.
	if (request.method !== 'HEAD' || definition.method === 'HEAD') {
		return response;
	}
	if (response.body !== null && !response.body.locked) {
		response.body.cancel().catch(() => {});
	}
	return new Response(null, {
		status: response.status,
		headers: response.headers,
	});
}
