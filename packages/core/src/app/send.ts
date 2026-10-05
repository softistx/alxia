/**
 * How a reply becomes a response: the headers and cookies the route set
 * merged with the reply's own, the body checked by the schema the route
 * declares for its status, and the answers the router gives on its own.
 */
import {
	type InternalErrorBody,
	ResponseValidationError,
	type RoutingErrorBody,
} from '../errors/errors';
import { vary } from '../reply/headers';
import { type AnyReply, Reply, toResponse } from '../reply/reply';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import { isAsyncIterable } from '../sse/async-iterable';
import { isNamedEventStreamSchema, toFrames } from '../sse/named-events';
import type { ResponseSchemas, ResponseSettings } from './types';

const internal: InternalErrorBody = { error: 'internal' };

/** The 500 of a request that failed: its body says no more than `internal`. */
export function internalError(): Response {
	return toResponse(500, internal, new Headers());
}

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
 * other error is logged and answered 500.
 */
export function failed(error: unknown, request: Request): Response {
	if (clientGone(error, request)) {
		return new Response(null, { status: CLIENT_GONE });
	}
	console.error(error);
	return internalError();
}

/** nginx's "client closed request": the status of a request its client left. */
export const CLIENT_GONE = 499;

/** A reply as it is, with what the route set on its response. */
export function send(
	reply: AnyReply,
	set: ResponseSettings,
	signal?: AbortSignal,
): Response {
	const headers = new Headers(set.headers);
	if (reply.headers !== undefined) {
		for (const [key, value] of new Headers(reply.headers)) {
			// A reply's Vary adds to the plugins': each said what it read.
			if (key === 'vary') {
				for (const name of value.split(',')) vary(headers, name);
			} else if (key === 'set-cookie') {
				// Each cookie is its own header: setting would keep the last.
				headers.append(key, value);
			} else headers.set(key, value);
		}
	}
	if ((set as { touched?: () => boolean }).touched?.()) {
		for (const cookie of set.cookies.toSetCookieHeaders()) {
			headers.append('set-cookie', cookie);
		}
	}
	return toResponse(reply.status, reply.body, headers, signal);
}

/**
 * `reply` checked against the schema `responses` declares for its status,
 * as that schema's output: what a reply after a `responds` goes through. A status with no schema, or a body its schema
 * refuses, throws a `ResponseValidationError`.
 */
export async function checkReply(
	method: string,
	path: string,
	responses: ResponseSchemas,
	reply: AnyReply,
	validateResponses: boolean,
): Promise<AnyReply> {
	const schema = responses[reply.status as keyof typeof responses];
	if (schema === undefined) {
		throw ResponseValidationError.undeclared(method, path, reply.status);
	}
	if (!validateResponses) return framed(schema, reply);
	const checked = await check(schema, reply.body, 'body');
	if (!checked.ok) {
		throw new ResponseValidationError(
			method,
			path,
			reply.status,
			checked.issues,
		);
	}
	return new Reply(reply.status, checked.value, {
		headers: reply.headers ?? {},
	});
}

/** What the router answers when no route takes the request. */
export function routingError(
	status: 404 | 405 | 426,
	error: RoutingErrorBody['error'],
	allowed?: readonly string[],
): Response {
	const headers = new Headers();
	if (allowed !== undefined) headers.set('allow', allowed.join(', '));
	const body: RoutingErrorBody = { error };
	return toResponse(status, body, headers);
}

/**
 * An unchecked reply as it is, but for a named event stream: its events
 * still need their `event:` lines, and their fields still refuse a line
 * break.
 */
function framed(schema: StandardSchemaV1, reply: AnyReply): AnyReply {
	if (!isNamedEventStreamSchema(schema) || !isAsyncIterable(reply.body)) {
		return reply;
	}
	return new Reply(
		reply.status,
		toFrames(schema['~events'], reply.body, false),
		{ headers: reply.headers ?? {} },
	);
}

/** Whether `reply` is a redirect, which no `responds` checks: a 3xx with no body. */
export function isRedirect(reply: AnyReply): boolean {
	return reply.status >= 300 && reply.status < 400 && reply.body === undefined;
}
