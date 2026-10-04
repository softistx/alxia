/**
 * A route's own run, once the router has found it: its context, then one
 * loop over its chain — its hooks, its middlewares, its validation, in the
 * order declared — then its handler, and the `onError` hooks when any of
 * it throws.
 */
import { ContentTooLargeError, HttpError } from '../errors/errors';
import { type AnyReply, Reply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import type { StatusCode } from '../types/status';
import { middleware, wrapped } from './chain-middleware';
import { routeContext } from './context';
import type { RouteDefinition, SocketDefinition } from './definition';
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
	const { definition } = run;
	const steps = definition.derive;
	const socket = !('method' in definition);
	// What a step adds goes on the context it runs with and on the route's
	// own, which `onError` reads: after a `validate` of the cookies, the
	// steps run with a copy holding the validated ones.
	const merge = (current: Ctx, added: object) => {
		Object.assign(current, added);
		if (current !== ctx) Object.assign(ctx, added);
	};
	const answer = (
		result: AnyReply | Response | Last,
		responses: ResponseSchemas | undefined,
		handler = false,
	) => sent(run, result, responses, handler);
	const step = async (
		index: number,
		ctx: Ctx,
		responses: ResponseSchemas | undefined,
	): Promise<Response | Last> => {
		const hook = steps[index];
		if (hook === undefined) return answer(await last(ctx), responses, true);
		const next = index + 1;
		const rest = () => step(next, ctx, responses);
		switch (hook.kind) {
			case 'derive': {
				let added = hook.run(ctx);
				if (added instanceof Promise) added = await added;
				if (added instanceof Reply) return answer(added, responses);
				if (added !== null && typeof added === 'object') {
					merge(ctx, added);
				}
				return step(next, ctx, responses);
			}
			case 'wrap':
				if (socket) return rest();
				// A wrap or a middleware returns the rest's response, or its own.
				return answer(
					(await wrapped(hook.run, ctx, rest)) as Response | Last,
					responses,
				);
			case 'middleware': {
				let result = middleware(hook.run, ctx, merge, rest, run.definition);
				if (result instanceof Promise) result = await result;
				return answer(result as AnyReply | Response | Last, responses);
			}
			case 'validate': {
				const raw = hook.raw === true;
				const validated = await validateStep(run, hook.schemas, raw, ctx);
				if ('refused' in validated) return validated.refused;
				return step(next, validated.ctx, responses);
			}
			case 'responds':
				return step(next, ctx, socket ? undefined : hook.responses);
		}
	};
	return step(0, ctx, undefined);
}

/**
 * A step's result as the chain returns it: a reply sent, once checked by
 * the `responds` in force. Synchronous but for a reply it checks. The
 * handler's reply must have a status `responds` declares; a middleware's
 * is checked when its status is declared, and sent as it is otherwise, as
 * its type says.
 */
function sent<Last>(
	run: ChainRun,
	result: AnyReply | Response | Last,
	responses: ResponseSchemas | undefined,
	handler: boolean,
): Response | Last | Promise<Response> {
	if (!(result instanceof Reply)) return result;
	const { definition, set } = run;
	const signal = run.request.request.signal;
	if (
		responses === undefined ||
		isRedirect(result) ||
		(!handler && responses[result.status as StatusCode] === undefined)
	) {
		return send(result, set, signal);
	}
	return checkReply(
		'method' in definition ? definition.method : 'WS',
		definition.path,
		responses,
		result,
		run.validateResponses,
	).then((checked) => send(checked, set, signal));
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
