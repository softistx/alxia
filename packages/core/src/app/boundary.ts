/**
 * Where what a request's chain throws becomes its response: around the
 * whole chain of a route, or of a request no route matches; and inside a
 * middleware that asks, through `settle`.
 */
import { HttpError, refusalOf } from '../errors/errors';
import { Reply, toResponse } from '../reply/reply';
import { chain } from './chain';
import { routeContext } from './context';
import type {
	Globals,
	RouteDefinition,
	Runtime,
	SocketDefinition,
} from './definition';
import { refuse } from './refusal';
import { clientGone, failed, internalError, routingError, send } from './send';
import { RUN, runOf, settledResponse } from './settled';
import type { BaseContext, Method, RequestContext } from './types';
import type { ChainRun } from './validation';

export { RUN } from './settled';

/** A route's request, from its chain to its handler's reply, sent. */
export async function handle(
	route: RouteDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	globals: Pick<Globals, 'parsers' | 'middlewares'>,
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
		appWide: globals.middlewares,
	};
	(ctx as { [RUN]?: ChainRun })[RUN] = run;
	try {
		return await chain<never>(run, ctx, async (validated) => {
			let reply = route.handler(validated as never);
			if (reply instanceof Promise) reply = await reply;
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
		return (
			settledResponse(run, error) ?? fail(route, error, ctx, validateResponses)
		);
	}
}

/**
 * A request no route matches: the 404, 405 or 426, behind every hook and
 * middleware of the app's chain (`Scope.unmatched`). The router's answer
 * alone when the chain is empty: no request pays for a chain it does not
 * have.
 */
export function unmatched(
	runtime: Runtime,
	request: RequestContext,
	status: 404 | 405 | 426,
	allowed?: readonly string[],
): Promise<Response> | Response {
	const error =
		status === 404
			? 'not_found'
			: status === 405
				? 'method_not_allowed'
				: 'upgrade_required';
	const hooks = runtime.unmatched();
	if (hooks.derive.length === 0 && runtime.globals.middlewares.length === 0) {
		return routingError(status, error, allowed);
	}
	const headers = allowed === undefined ? {} : { allow: allowed.join(', ') };
	const definition: RouteDefinition = {
		method: request.request.method as Method,
		path: request.url.pathname,
		schema: {},
		handler: () => new Reply(status, { error }, { headers }),
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
 * An error a route threw, answered: a refusal — a `ValidationError`, or a
 * body past the route's `bodyLimit` — by the `onRefusal` hooks in force
 * or its default 400 or 413; anything else by the `onError` hooks in
 * order, then an `HttpError` as it says and anything else as a 500.
 */
export async function fail(
	definition: RouteDefinition | SocketDefinition,
	error: unknown,
	ctx: BaseContext,
	validateResponses = true,
): Promise<Response> {
	// The client left: no hook answers a request nobody reads.
	if (clientGone(error, ctx.request)) return failed(error, ctx.request);
	let thrown = error;
	const refusal = refusalOf(error);
	if (refusal !== undefined) {
		try {
			return await refuse(definition, refusal, ctx.set, ctx, validateResponses);
		} catch (hookError) {
			// The hook threw answering it: what it threw goes on to the
			// `onError` hooks for a validation, as in 0.3; a 500 otherwise.
			if (refusal.kind !== 'validation') {
				console.error(hookError);
				return internalError();
			}
			thrown = hookError;
		}
	}
	for (const hook of definition.onError) {
		let handled = hook(thrown, ctx);
		if (handled instanceof Promise) handled = await handled;
		if (handled instanceof Reply) return send(handled, ctx.set);
	}
	if (thrown instanceof HttpError) {
		return send(new Reply(thrown.status, thrown.body), ctx.set);
	}
	return failed(thrown, ctx.request);
}

/**
 * The response `pending` — what `next()` returned — settles to, its
 * rejection answered here as the route would answer it: a refusal by its
 * `onRefusal` hooks or the default 400 or 413, any other error by its
 * `onError` hooks, an `HttpError` as it says, a 500. What a middleware
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
			settledResponse(run, error) ??
			(await fail(
				run.definition,
				error,
				ctx as BaseContext,
				run.validateResponses,
			));
		run.settled = { pending, error };
		return response as Settled;
	}
}

/** `settle` on a context no route runs: an `HttpError` as it says, a 500. */
function outside(ctx: object, error: unknown): Response {
	const { request } = ctx as Partial<BaseContext>;
	if (error instanceof HttpError) {
		return toResponse(error.status, error.body, new Headers());
	}
	return failed(error, request ?? new Request('http://localhost'));
}
