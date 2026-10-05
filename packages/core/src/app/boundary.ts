/**
 * Where what a request's chain throws becomes its response: around the
 * whole chain of a route, or of a request no route matches; and inside a
 * middleware that asks, through `settle`.
 */
import { HttpError } from '../errors/errors';
import { Reply, toResponse } from '../reply/reply';
import { ALL } from '../router/router';
import {
	clientGone,
	errorReply,
	failed,
	routingError,
	routingReply,
} from './answers';
import { chain } from './chain';
import { routeContext } from './context';
import type {
	Definition,
	Globals,
	RouteDefinition,
	Runtime,
} from './definition';
import { guardedHooks } from './guarded';
import { send } from './send';
import { RUN, runOf, settledResponse } from './settled';
import type { BaseContext, Method, RequestContext } from './types';
import type { ChainRun } from './validation';

export { RUN } from './settled';

/** A route's request, from its chain to its handler's reply, sent. */
export async function handle(
	route: RouteDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	globals: Pick<Globals, 'parsers'>,
	validateResponses: boolean,
	/** Whether a route matched: else `ctx.route` is none, as for the 404 it ends with. */
	matched = true,
): Promise<Response> {
	const name = matched ? route.path : undefined;
	const { ctx, set } = routeContext(route, request, rawParams, name);
	const run: ChainRun = {
		definition: route,
		request,
		rawParams,
		set,
		parsers: globals.parsers,
		validateResponses,
	};
	(ctx as { [RUN]?: ChainRun })[RUN] = run;
	try {
		return await chain<never>(run, ctx, async (validated) => {
			let reply = ended(route, validated, request);
			if (reply instanceof Promise) reply = await reply;
			// An `all` route's end, a middleware: its own `Response`, sent.
			if (reply instanceof Response && route.method === ALL) return reply;
			if (!(reply instanceof Reply)) {
				throw new TypeError(
					`${route.method} ${route.path}: the handler returned no reply. ` +
						'Return ctx.reply(status, body).',
				);
			}
			return reply;
		});
	} catch (error) {
		(request as { error: unknown }).error = error;
		// An error the observers settled: the response they made of it.
		return settledResponse(run, error) ?? fail(error, ctx);
	}
}

/**
 * What the route's handler returns: an `all` route's, which may be a
 * middleware that answers (`AllEnd`), is given a `next` too, answering the
 * 404 of what is after it: nothing.
 */
function ended(
	route: RouteDefinition,
	validated: object,
	request: RequestContext,
): unknown {
	if (route.method !== ALL) return route.handler(validated as never);
	const end = route.handler as unknown as (
		ctx: object,
		next: unknown,
	) => unknown;
	return end(validated, async () => routingError(request, 404));
}

/**
 * A request no route matches: the 404, 405 or 426, behind every
 * middleware of the app's chain (`Scope.unmatched`); a 405's or a 426's
 * behind the chain of the routes that own its path too (`owners`,
 * `guarded.ts`). The router's answer alone when the chain is empty: no
 * request pays for a chain it does not have.
 */
export function unmatched(
	runtime: Runtime,
	request: RequestContext,
	status: 404 | 405 | 426,
	allowed?: readonly string[],
	owners?: Iterable<Definition>,
): Promise<Response> | Response {
	const hooks =
		owners === undefined
			? runtime.unmatched()
			: guardedHooks(runtime.unmatched(), owners, request.url.pathname);
	if (hooks.derive.length === 0) {
		return routingError(request, status, allowed);
	}
	const definition: RouteDefinition = {
		method: request.request.method as Method,
		path: request.url.pathname,
		schema: {},
		handler: () => routingReply(request, status, allowed),
		...hooks,
	};
	return handle(
		definition,
		request,
		{},
		runtime.globals,
		runtime.validateResponses,
		false,
	);
}

/**
 * An error a route threw that no middleware caught, answered at the route
 * boundary: an `HttpError` — a `ValidationError`'s 400 and a
 * `ContentTooLargeError`'s 413 among them — with its status and body,
 * anything else with a logged 500. A client that left gets the 499 nobody
 * reads, and nothing is logged.
 */
export function fail(error: unknown, ctx: BaseContext): Response {
	if (clientGone(error, ctx.request)) return failed(error, ctx);
	if (error instanceof HttpError) return send(errorReply(error, ctx), ctx.set);
	return failed(error, ctx);
}

/**
 * The response `pending` — what `next()` returned — settles to, its
 * rejection answered here as the route boundary would answer it: an
 * `HttpError` as it says — a refusal's 400 or 413 — anything else a 500.
 * What a middleware
 * that must see every response reads — a logger, a header on errors too:
 *
 * ```ts
 * const poweredBy = defineMiddleware(async (ctx, next) => {
 *   const response = await settle(ctx, next());
 *   response.headers.set('x-powered-by', 'alxia');
 *   return response;
 * });
 * ```
 *
 * The error is not swallowed: once the middleware returns the response,
 * the error goes on to the middlewares around it, so a try/catch there
 * still catches it, and another `settle` there reads the response this
 * one returned. When none answers it, that response is the one sent. The
 * error stays on `ctx.error`.
 */
export async function settle<Settled extends Response>(
	ctx: object,
	pending: Promise<Settled>,
): Promise<Settled> {
	try {
		return await pending;
	} catch (error) {
		const run = runOf(ctx);
		(ctx as { error: unknown }).error = error;
		if (run === undefined) return outside(ctx, error) as Settled;
		(run.request as { error: unknown }).error = error;
		const response =
			settledResponse(run, error) ?? fail(error, ctx as BaseContext);
		run.settled = { pending, error };
		return response as Settled;
	}
}

/** `settle` on a context no route runs: an `HttpError` as it says, a 500. */
function outside(ctx: object, error: unknown): Response {
	const { request = new Request('http://localhost'), url } =
		ctx as Partial<BaseContext>;
	const at = url === undefined ? { request } : { request, url };
	if (error instanceof HttpError) {
		const reply = errorReply(error, { ...ctx, ...at });
		return toResponse(reply.status, reply.body, new Headers(reply.headers));
	}
	return failed(error, { ...ctx, ...at });
}
