/**
 * The whole of a request: routing, then the route's own run or the
 * socket's upgrade.
 */

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
	const forwarded = runtime.proxy?.(request, server);
	const ctx: RequestContext = {
		request,
		url: new URL(request.url),
		server,
		ip: forwarded === undefined ? runtime.ip(request, server) : forwarded.ip,
		route: undefined,
		error: undefined,
		[SERVED]: runtime.served,
		[ORIGIN]: forwarded?.origin,
	} as RequestContext;
	if (forwarded?.refused === true) return untrustedProxy(ctx);
	try {
		const response = await route(runtime, ctx, path);
		return response === UPGRADED ? (undefined as never) : response;
	} catch (error) {
		return failed(error, ctx);
	}
}

/**
 * The route the request reached, run: the socket a `websocket` upgrade
 * asks for, a `GET` for a `HEAD` no route takes, or the 404, 405 or 426
 * when none answers, behind the app's chain (`unmatched`).
 */
async function route(
	runtime: Runtime,
	ctx: RequestContext,
	path: string | undefined,
): Promise<Response | typeof UPGRADED> {
	const { router, globals } = runtime;
	const { request, url } = ctx;
	const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
	const find = (
		method: string,
	):
		| { readonly value: Definition; readonly params: Record<string, string> }
		| { readonly allowed: readonly string[] }
		| undefined => {
		if (path === undefined) {
			const pages = globals.pages.size === 0 ? undefined : globals.pages.keys();
			return router.match(method, url.pathname, pages);
		}
		const methods = router.methodsAt(path);
		if (methods === undefined) return undefined;
		const value = methods.get(method);
		if (value !== undefined) {
			return { value, params: router.paramsAt(path, url.pathname) };
		}
		return { allowed: [...methods.keys()] };
	};

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
	let head = false;
	if (request.method === 'HEAD' && match !== undefined && 'allowed' in match) {
		const get = find('GET');
		if (get !== undefined && 'value' in get) {
			match = get;
			head = true;
		}
	}
	if (match === undefined) return unmatched(runtime, ctx, 404);
	if ('allowed' in match) {
		const allowed = match.allowed.filter((method) => method !== 'WS');
		if (allowed.length === 0) return unmatched(runtime, ctx, 426);
		return unmatched(runtime, ctx, 405, allowed);
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
	return head
		? new Response(null, {
				status: response.status,
				headers: response.headers,
			})
		: response;
}
