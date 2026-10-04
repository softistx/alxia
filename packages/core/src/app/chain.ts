/**
 * A route's own run, once the router has found it: its context, then one
 * loop over its chain — its hooks, its middlewares, its validation, in the
 * order declared — then its handler, and the `onError` hooks when any of
 * it throws.
 */
import { ContentTooLargeError, HttpError } from '../errors/errors';
import { type AnyReply, Reply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import { routeContext } from './context';
import type {
	MiddlewareHook,
	RouteDefinition,
	SocketDefinition,
	WrapHook,
} from './definition';
import { refuse } from './refusal';
import {
	checkReply,
	clientGone,
	failed,
	internalError,
	isRedirect,
	send,
} from './send';
import type { BaseContext, RequestContext, ResponseSchemas } from './types';
import { type ChainRun, validateStep } from './validation';

type Ctx = Record<string, unknown> & BaseContext;

/**
 * Runs the chain of a route, `step(index)` by `step(index)`: a `derive`
 * adds to the context or ends the request, a `wrap` or a middleware runs
 * the rest inside it, a `validate` checks the request, a `responds` checks
 * every reply after it; past the last, `last` — the handler — reads the
 * context they built. Each reply is checked by the `responds` in force
 * where it is made, then sent. A socket's upgrade skips the `wrap` hooks
 * and the `responds`: it has no response to wrap or check.
 */
export async function chain<Last>(
	run: ChainRun,
	ctx: Ctx,
	last: (ctx: Ctx) => Promise<AnyReply | Response | Last>,
): Promise<Response | Last> {
	const { definition, set } = run;
	const steps = definition.derive;
	const socket = !('method' in definition);
	const method = socket ? 'WS' : definition.method;
	const signal = run.request.request.signal;
	// Synchronous but for a reply a `responds` checks: most steps await nothing more.
	const answer = (
		result: unknown,
		responses: ResponseSchemas | undefined,
	): Response | Last | Promise<Response> => {
		if (!(result instanceof Reply)) return result as Response | Last;
		if (responses === undefined || isRedirect(result)) {
			return send(result, set, signal);
		}
		return checkReply(
			method,
			definition.path,
			responses,
			result,
			run.validateResponses,
		).then((checked) => send(checked, set, signal));
	};
	const step = async (
		index: number,
		ctx: Ctx,
		responses: ResponseSchemas | undefined,
	): Promise<Response | Last> => {
		const hook = steps[index];
		if (hook === undefined) return answer(await last(ctx), responses);
		const next = index + 1;
		const rest = () => step(next, ctx, responses);
		switch (hook.kind) {
			case 'derive': {
				let added = hook.run(ctx);
				if (added instanceof Promise) added = await added;
				if (added instanceof Reply) return answer(added, responses);
				if (added !== null && typeof added === 'object') {
					Object.assign(ctx, added);
				}
				return step(index + 1, ctx, responses);
			}
			case 'wrap':
				if (socket) return rest();
				return answer(await wrapped(hook.run, ctx, rest), responses);
			case 'middleware': {
				let result = middleware(hook.run, ctx, rest, definition, socket);
				if (result instanceof Promise) result = await result;
				return answer(result, responses);
			}
			case 'validate': {
				const raw = hook.raw === true;
				const validated = await validateStep(run, hook.schemas, raw, ctx);
				if ('refused' in validated) return validated.refused;
				return step(index + 1, validated.ctx, responses);
			}
			case 'responds':
				return step(index + 1, ctx, socket ? undefined : hook.responses);
		}
	};
	return step(0, ctx, undefined);
}

/** A `wrap` hook run around `rest`: its reply, or the response it returns. */
async function wrapped(
	hook: WrapHook,
	ctx: Ctx,
	rest: () => Promise<unknown>,
): Promise<unknown> {
	const result = hook(ctx, rest as () => Promise<Response>);
	return result instanceof Promise ? await result : result;
}

/**
 * A middleware run with `next`, which merges what it is given into the
 * context and runs `rest`, once: its result, or a promise of it. What
 * `rest` resolves to that is not a response — a socket's upgrade —
 * reaches the middleware as a stand-in response, and comes back as itself
 * when the middleware returns it.
 */
function middleware(
	hook: MiddlewareHook,
	ctx: Ctx,
	rest: () => Promise<unknown>,
	definition: RouteDefinition | SocketDefinition,
	socket: boolean,
): unknown {
	const label = () =>
		`${'method' in definition ? definition.method : 'WS'} ${definition.path}`;
	let called = false;
	let parked: { stand: Response; value: unknown } | undefined;
	const next = (added?: object): Promise<Response> => {
		if (called) {
			throw new TypeError(`${label()}: a middleware called next() twice`);
		}
		called = true;
		if (added !== null && typeof added === 'object') {
			Object.assign(ctx, added);
		}
		if (!socket) return rest() as Promise<Response>;
		return rest().then((downstream) => {
			if (downstream instanceof Response) return downstream;
			parked = { stand: new Response(null), value: downstream };
			return parked.stand;
		});
	};
	const settle = (result: unknown): unknown => {
		if (parked !== undefined && result === parked.stand) return parked.value;
		if (result instanceof Reply || result instanceof Response) return result;
		const name = hook.name ? ` (${hook.name})` : '';
		throw new TypeError(
			`${label()}: a middleware${name} returned ${result === undefined ? 'nothing' : typeof result}: return next(), a reply or a Response`,
		);
	};
	const result = hook(ctx, next);
	return result instanceof Promise ? result.then(settle) : settle(result);
}

/** A route's request, from its chain to its handler's reply, sent. */
export async function handle(
	route: RouteDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	parsers: readonly BodyParser[],
	validateResponses: boolean,
): Promise<Response> {
	const { ctx, set } = routeContext(route, request, rawParams);
	const run: ChainRun = {
		definition: route,
		request,
		rawParams,
		set,
		parsers,
		validateResponses,
	};
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
		return fail(route, error, ctx, validateResponses);
	}
}

/**
 * An error a route threw, answered by its `onError` hooks in order; past
 * the last, an `HttpError` as it says and anything else as a 500. A body
 * past the route's `bodyLimit` is a refusal instead, answered as
 * `refuse` answers one: by the `onRefusal` hook in force, or its 413.
 */
export async function fail(
	definition: RouteDefinition | SocketDefinition,
	error: unknown,
	ctx: BaseContext,
	validateResponses = true,
): Promise<Response> {
	// The client left: no hook answers a request nobody reads.
	if (clientGone(error, ctx.request)) return failed(error, ctx.request);
	if (error instanceof ContentTooLargeError) {
		try {
			return await refuse(
				definition,
				{ kind: 'body_limit', limit: error.limit },
				ctx.set,
				ctx,
				validateResponses,
			);
		} catch (thrown) {
			// The hook threw answering it: a 500, as a validation refusal's is.
			console.error(thrown);
			return internalError();
		}
	}
	for (const hook of definition.onError) {
		let handled = hook(error, ctx);
		if (handled instanceof Promise) handled = await handled;
		if (handled instanceof Reply) return send(handled, ctx.set);
	}
	if (error instanceof HttpError) {
		return send(new Reply(error.status, error.body), ctx.set);
	}
	return failed(error, ctx.request);
}
