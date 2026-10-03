/**
 * The whole of a request: the global hooks around it, routing, then the
 * route's own run or the socket's upgrade.
 */
import { handle } from './chain';
import type { Definition, Runtime } from './definition';
import { internalError, routingError } from './send';
import { UPGRADED, upgradeSocket } from './socket';
import type { RequestContext } from './types';

/** The whole of a request: global hooks around the route's own pipeline. */
export async function serve(
	runtime: Runtime,
	request: Request,
	server: Bun.Server<unknown> | undefined,
	path: string | undefined,
): Promise<Response> {
	const url = new URL(request.url);
	const ctx: RequestContext = {
		request,
		url,
		server,
		ip: runtime.ip(request, server),
		route: undefined,
		error: undefined,
	};
	const around = runtime.globals.around;
	const upgrade = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
	if (around.length === 0 || upgrade) return pipeline(runtime, ctx, path);
	const run = (index: number): Promise<Response> => {
		const hook = around[index];
		if (hook === undefined) return pipeline(runtime, ctx, path);
		return hook(ctx, () => run(index + 1));
	};
	try {
		return await run(0);
	} catch (error) {
		console.error(error);
		return internalError();
	}
}

/** The `onRequest` hooks, the route, then the `onResponse` hooks. */
async function pipeline(
	runtime: Runtime,
	ctx: RequestContext,
	path: string | undefined,
): Promise<Response> {
	let response: Response | typeof UPGRADED | undefined;
	try {
		for (const hook of runtime.globals.onRequest) {
			let early = hook(ctx);
			if (early instanceof Promise) early = await early;
			if (early instanceof Response) {
				response = early;
				break;
			}
		}
		response ??= await route(runtime, ctx, path);
	} catch (error) {
		console.error(error);
		response = internalError();
	}
	if (response === UPGRADED) return undefined as never;
	for (const hook of runtime.globals.onResponse) {
		try {
			let replaced = hook(response, ctx);
			if (replaced instanceof Promise) replaced = await replaced;
			if (replaced instanceof Response) response = replaced;
		} catch (error) {
			console.error(error);
		}
	}
	return response;
}

/**
 * The route the request reached, run: the socket a `websocket` upgrade
 * asks for, a `GET` for a `HEAD` no route takes, or the 404, 405 or 426
 * when none answers.
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
			return upgradeSocket(socket.value, ctx, socket.params, globals.parsers);
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
	if (match === undefined) return routingError(404, 'not_found');
	if ('allowed' in match) {
		const allowed = match.allowed.filter((method) => method !== 'WS');
		if (allowed.length === 0) return routingError(426, 'upgrade_required');
		return routingError(405, 'method_not_allowed', allowed);
	}
	const definition = match.value;
	(ctx as { route: string | undefined }).route = definition.path;
	if (definition.kind === 'ws') return routingError(426, 'upgrade_required');
	const response = await handle(
		definition,
		ctx,
		match.params,
		globals.parsers,
		runtime.validateResponses,
	);
	return head
		? new Response(null, {
				status: response.status,
				headers: response.headers,
			})
		: response;
}
