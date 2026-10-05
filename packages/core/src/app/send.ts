/**
 * How a reply becomes a response: the headers and cookies the route set
 * merged with the reply's own, the body checked by the schema the route
 * declares for its status, and the answers the router gives on its own.
 */
import { ResponseValidationError } from '../errors/errors';
import { vary } from '../reply/headers';
import { type AnyReply, Reply, toResponse } from '../reply/reply';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import { isAsyncIterable } from '../sse/async-iterable';
import { isNamedEventStreamSchema, toFrames } from '../sse/named-events';
import type { ResponseSchemas, ResponseSettings } from './types';

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
