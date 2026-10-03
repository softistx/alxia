/**
 * A request the app refused before its handler ran, answered: by the
 * route's `onRefusal` hook, or by the default.
 */
import type { Refusal, ValidationErrorBody } from '../errors/errors';
import { Reply } from '../reply/reply';
import type { RouteDefinition, SocketDefinition } from './definition';
import { checkReply, send } from './send';
import type { BaseContext, ResponseSettings } from './types';

/**
 * A refused request, answered by the route's `onRefusal` hook — its reply
 * checked by the schemas the hook declares — or, when it has none or
 * returns nothing, by the default: a 400 with the issues.
 */
export async function refuse(
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
