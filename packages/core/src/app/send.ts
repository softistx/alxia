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
import { check } from '../schema/standard-schema';
import type { RouteDefinition } from './definition';
import type { ResponseSettings } from './types';

const internal: InternalErrorBody = { error: 'internal' };

/** The 500 of a request that failed: its body says no more than `internal`. */
export function internalError(): Response {
	return toResponse(500, internal, new Headers());
}

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
 * A handler's reply, checked against the schema its route declares for its
 * status and sent as that schema's output. A status the route does not
 * declare, or a body its schema refuses, throws a `ResponseValidationError`.
 */
export async function sendDeclared(
	route: RouteDefinition,
	reply: AnyReply,
	set: ResponseSettings,
	signal: AbortSignal,
	validateResponses: boolean,
): Promise<Response> {
	const responses = route.schema.response;
	if (responses === undefined || isRedirect(reply)) {
		return send(reply, set, signal);
	}
	const schema = responses[reply.status as keyof typeof responses];
	if (schema === undefined) {
		throw ResponseValidationError.undeclared(
			route.method,
			route.path,
			reply.status,
		);
	}
	if (!validateResponses) return send(reply, set, signal);
	const checked = await check(schema, reply.body, 'body');
	if (!checked.ok) {
		throw new ResponseValidationError(
			route.method,
			route.path,
			reply.status,
			checked.issues,
		);
	}
	return send(
		new Reply(reply.status, checked.value, { headers: reply.headers ?? {} }),
		set,
		signal,
	);
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

function isRedirect(reply: AnyReply): boolean {
	return reply.status >= 300 && reply.status < 400 && reply.body === undefined;
}
