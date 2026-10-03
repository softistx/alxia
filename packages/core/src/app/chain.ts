/**
 * A route's own run, once the router has found it: its context, its hooks
 * in the order declared, the request validated, the handler, and the
 * `onError` hooks when any of it throws.
 */
import {
	HttpError,
	type Refusal,
	type RequestPart,
	type ValidationErrorBody,
	type ValidationIssue,
} from '../errors/errors';
import { createReply, Reply } from '../reply/reply';
import {
	type BodyParser,
	readBody,
	readCookies,
	readHeaders,
	readQuery,
} from '../request/read';
import { check } from '../schema/standard-schema';
import type { RedirectStatus } from '../types/status';
import type { RouteDefinition, SocketDefinition } from './definition';
import { checkReply, internalError, send, sendDeclared } from './send';
import type {
	BaseContext,
	RedirectFunction,
	RequestContext,
	ResponseSettings,
} from './types';

const redirect: RedirectFunction = (location, status) =>
	new Reply(status ?? (302 as RedirectStatus), undefined, {
		headers: { location: String(location) },
	}) as never;

/** The context a route's hooks and handler read, and what they set on its response. */
export function routeContext(
	definition: RouteDefinition | SocketDefinition,
	request: RequestContext,
	pathParams: Record<string, string>,
): { ctx: Record<string, unknown> & BaseContext; set: ResponseSettings } {
	let cookies: Bun.CookieMap | undefined;
	const set: ResponseSettings & { readonly touched: () => boolean } = {
		headers: new Headers(),
		get cookies() {
			cookies ??= new Bun.CookieMap();
			return cookies;
		},
		touched: () => cookies !== undefined,
	};
	const ctx: Record<string, unknown> & BaseContext = {
		...request,
		route: definition.path,
		pathParams,
		set,
		reply: createReply,
		redirect,
	};
	return { ctx, set };
}

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
		const body = await readBody(request.request, parsers);
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

/**
 * A refused request, answered by the route's `onRefusal` hook — its reply
 * checked by the schemas the hook declares — or, when it has none or
 * returns nothing, by the default: a 400 with the issues.
 */
async function refuse(
	definition: RouteDefinition | SocketDefinition,
	refusal: Refusal,
	set: ResponseSettings,
	ctx: BaseContext,
	validateResponses: boolean,
): Promise<Response> {
	const handler = definition.refusal;
	if (handler !== undefined) {
		let reply = handler.hook(refusal, ctx);
		if (reply instanceof Promise) reply = await reply;
		const method = 'method' in definition ? definition.method : 'WS';
		if (reply instanceof Reply) {
			if (handler.response !== undefined) {
				reply = await checkReply(
					method,
					definition.path,
					handler.response,
					reply,
					validateResponses,
				);
			}
			return send(withContentType(reply, handler.contentType), set);
		}
		if (reply !== undefined) {
			throw new TypeError(
				`${method} ${definition.path}: the onRefusal hook returned neither a reply nor nothing.`,
			);
		}
	}
	const body: ValidationErrorBody = {
		error: 'validation',
		issues: refusal.issues,
	};
	return send(new Reply(400, body), set);
}

/** `reply` with `content-type` set to `type`, unless it sets one. */
function withContentType(reply: Reply, type: string | undefined): Reply {
	if (type === undefined) return reply;
	const headers = new Headers(reply.headers);
	if (headers.has('content-type')) return reply;
	headers.set('content-type', type);
	return new Reply(reply.status, reply.body, { headers });
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
		return fail(route, error, ctx);
	}
}

/**
 * An error a route threw, answered by its `onError` hooks in order; past
 * the last, an `HttpError` as it says and anything else as a 500.
 */
export async function fail(
	definition: RouteDefinition | SocketDefinition,
	error: unknown,
	ctx: BaseContext,
): Promise<Response> {
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
