/**
 * A route's own run, once the router has found it: its context, its hooks
 * in the order declared, the request validated, the handler, and the
 * `onError` hooks when any of it throws.
 */
import {
	ContentTooLargeError,
	HttpError,
	type RequestPart,
	type ValidationIssue,
} from '../errors/errors';
import { Reply } from '../reply/reply';
import {
	type BodyParser,
	readBody,
	readCookies,
	readHeaders,
	readQuery,
} from '../request/read';
import { check } from '../schema/standard-schema';
import { routeContext } from './context';
import type { RouteDefinition, SocketDefinition } from './definition';
import { refuse } from './refusal';
import { internalError, send, sendDeclared } from './send';
import type { BaseContext, RequestContext, ResponseSettings } from './types';

/**
 * Runs the hooks of a route in order — a `derive` adds to the context or
 * ends the request, a `wrap` runs the rest inside it — then validates the
 * request, then `last`. A socket's upgrade skips the `wrap` hooks: it has
 * no response to wrap.
 */
export async function chain<Last>(
	definition: RouteDefinition | SocketDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	set: ResponseSettings,
	ctx: Record<string, unknown> & BaseContext,
	parsers: readonly BodyParser[],
	validateResponses: boolean,
	last: () => Promise<Response | Last>,
): Promise<Response | Last> {
	const hooks = definition.derive;
	const socket = !('method' in definition);
	const signal = request.request.signal;
	const step = async (index: number): Promise<Response | Last> => {
		const hook = hooks[index];
		if (hook === undefined) {
			const refused = await validate(
				definition,
				request,
				rawParams,
				set,
				ctx,
				parsers,
				validateResponses,
			);
			return refused ?? last();
		}
		if (hook.kind === 'wrap') {
			if (socket) return step(index + 1);
			let wrapped = hook.run(ctx, () => step(index + 1) as Promise<Response>);
			if (wrapped instanceof Promise) wrapped = await wrapped;
			return wrapped instanceof Reply ? send(wrapped, set, signal) : wrapped;
		}
		let added = hook.run(ctx);
		if (added instanceof Promise) added = await added;
		if (added instanceof Reply) return send(added, set, signal);
		if (added !== null && typeof added === 'object') {
			Object.assign(ctx, added);
		}
		return step(index + 1);
	};
	return step(0);
}

/** The request checked by the route's schemas: the response that refuses it, or nothing. */
async function validate(
	definition: RouteDefinition | SocketDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	set: ResponseSettings,
	ctx: Record<string, unknown> & BaseContext,
	parsers: readonly BodyParser[],
	validateResponses: boolean,
): Promise<Response | undefined> {
	const { schema } = definition;
	const issues: ValidationIssue[] = [];
	let part: RequestPart | undefined;
	const parts = [
		['params', schema.params, () => rawParams],
		['query', schema.query, () => readQuery(request.url)],
		['headers', schema.headers, () => readHeaders(request.request.headers)],
		['cookies', schema.cookies, () => readCookies(request.request.headers)],
	] as const;
	for (const [target, partSchema, read] of parts) {
		const raw = read();
		if (partSchema === undefined) {
			ctx[target] = raw;
			continue;
		}
		const checked = await check(partSchema, raw, target);
		if (checked.ok) ctx[target] = checked.value;
		else {
			part ??= target;
			issues.push(...checked.issues);
		}
	}
	ctx['body'] = undefined;
	const bodySchema = 'body' in schema ? schema.body : undefined;
	if (bodySchema !== undefined) {
		const body = await readBody(ctx.request, parsers);
		if (!body.ok) {
			part ??= 'body';
			issues.push(body.issue);
		} else {
			const checked = await check(bodySchema, body.value, 'body');
			if (checked.ok) ctx['body'] = checked.value;
			else {
				part ??= 'body';
				issues.push(...checked.issues);
			}
		}
	}
	if (part === undefined) return undefined;
	return refuse(
		definition,
		{ kind: 'validation', part, issues },
		set,
		ctx,
		validateResponses,
	);
}

/** A route's request, from its hooks to its handler's reply, sent. */
export async function handle(
	route: RouteDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	parsers: readonly BodyParser[],
	validateResponses: boolean,
): Promise<Response> {
	const { ctx, set } = routeContext(route, request, rawParams);
	try {
		return await chain(
			route,
			request,
			rawParams,
			set,
			ctx,
			parsers,
			validateResponses,
			async () => {
				let reply = route.handler(ctx as never);
				if (reply instanceof Promise) reply = await reply;
				if (!(reply instanceof Reply)) {
					throw new TypeError(
						`${route.method} ${route.path}: the handler returned no reply. ` +
							'Return ctx.reply(status, body).',
					);
				}
				return sendDeclared(
					route,
					reply,
					set,
					request.request.signal,
					validateResponses,
				);
			},
		);
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
	console.error(error);
	return internalError();
}
