/**
 * The answers alxia gives on its own — an escaped `HttpError`, a 500, the
 * router's 404, 405 and 426 — in the format of the app that serves the
 * request: its `{ error: … }` bodies, or RFC 9457 problems.
 */
import type { InternalErrorBody, RoutingErrorBody } from '../errors/errors';
import type { HttpError } from '../errors/http-error';
import { type Problem, problemOf, problemOfError } from '../errors/problems';
import { Reply, toResponse } from '../reply/reply';
import { errorFormat } from './served';

/** What an answer reads of the request: its URL and method, and the serving app's format. */
export interface Answered {
	readonly request: Request;
	readonly url?: URL;
}

const PROBLEM = 'application/problem+json';
const internal: InternalErrorBody = { error: 'internal' };

/** nginx's "client closed request": the status of a request its client left. */
export const CLIENT_GONE = 499;

/**
 * Whether `error` is the client hanging up: the request's signal is
 * aborted and the error is that abort, as Bun's body read throws it (an
 * `AbortError`, not the signal's own reason). Any other error raised after
 * the client left, a bug included, is the app's.
 */
export function clientGone(error: unknown, request: Request): boolean {
	if (!request.signal.aborted) return false;
	return (
		error === request.signal.reason ||
		(error instanceof DOMException && error.name === 'AbortError')
	);
}

/**
 * What a request that failed with `error` gets. The client hanging up
 * mid-request (`clientGone`) is no app error: nothing is logged, and the
 * 499 nobody reads is only what an observer, a logger's, sees. Any
 * other error is logged and answered 500, whose body says no more than
 * that the server failed.
 */
export function failed(error: unknown, ctx: Answered): Response {
	if (clientGone(error, ctx.request)) {
		return new Response(null, { status: CLIENT_GONE });
	}
	console.error(error);
	if (errorFormat(ctx) === 'json') {
		return toResponse(500, internal, new Headers());
	}
	const body = problemOf(at(ctx), {
		status: 500,
		detail: 'The server failed to answer the request',
	});
	return toResponse(500, body, new Headers({ 'content-type': PROBLEM }));
}

/** An escaped `HttpError`, as the reply the route boundary sends: its body, or its problem. */
export function errorReply(error: HttpError, ctx: Answered): Reply<number> {
	if (errorFormat(ctx) === 'json') return new Reply(error.status, error.body);
	return new Reply(error.status, problemOfError(error, at(ctx).url.pathname), {
		headers: { 'content-type': PROBLEM },
	});
}

/** What the router answers when no route takes the request: a 404, a 405 with `Allow`, a 426. */
export function routingReply(
	ctx: Answered,
	status: 404 | 405 | 426,
	allowed?: readonly string[],
): Reply<number> {
	const headers: Record<string, string> =
		allowed === undefined ? {} : { allow: allowed.join(', ') };
	if (errorFormat(ctx) === 'json') {
		return new Reply(status, { error: ROUTING[status] }, { headers });
	}
	headers['content-type'] = PROBLEM;
	return new Reply(status, routingProblem(ctx, status), { headers });
}

/** `routingReply` as a response, for a request no chain runs. */
export function routingError(
	ctx: Answered,
	status: 404 | 405 | 426,
	allowed?: readonly string[],
): Response {
	const headers = new Headers();
	if (allowed !== undefined) headers.set('allow', allowed.join(', '));
	if (errorFormat(ctx) === 'json') {
		const body: RoutingErrorBody = { error: ROUTING[status] };
		return toResponse(status, body, headers);
	}
	headers.set('content-type', PROBLEM);
	return toResponse(status, routingProblem(ctx, status), headers);
}

const ROUTING = {
	404: 'not_found',
	405: 'method_not_allowed',
	426: 'upgrade_required',
} as const satisfies Record<404 | 405 | 426, RoutingErrorBody['error']>;

/** The router's answer as a problem, its detail naming the method and the path. */
function routingProblem(ctx: Answered, status: 404 | 405 | 426): Problem {
	const { url } = at(ctx);
	const method = ctx.request.method;
	const detail =
		status === 404
			? `No route serves ${method} ${url.pathname}`
			: status === 405
				? `${url.pathname} does not allow ${method}`
				: `${url.pathname} is a WebSocket: open it with an upgrade request`;
	return problemOf({ url }, { status, detail });
}

/** The request's URL: its context's, or read from the request. */
function at(ctx: Answered): { readonly url: URL } {
	return { url: ctx.url ?? new URL(ctx.request.url) };
}
