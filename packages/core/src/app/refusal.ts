/**
 * A request the app refused before its handler ran, answered: by the
 * route's `onRefusal` hook, or by the default.
 */
import type {
	ContentTooLargeBody,
	Refusal,
	ValidationErrorBody,
} from '../errors/errors';
import { type AnyReply, Reply } from '../reply/reply';
import type {
	RefusalHandler,
	RouteDefinition,
	SocketDefinition,
} from './definition';
import { checkReply, send } from './send';
import type { BaseContext, ResponseSettings } from './types';

/**
 * A refused request, answered by the route's `onRefusal` hooks — its
 * hooks of the refusal's kind in order, then its general hook, each reply
 * checked by the schemas its hook declares — or, when none answers, by the
 * default of its kind: a 400 with the issues of a `validation`, the 413 of
 * a `body_limit`.
 */
export async function refuse(
	definition: RouteDefinition | SocketDefinition,
	refusal: Refusal,
	set: ResponseSettings,
	ctx: BaseContext,
	validateResponses: boolean,
): Promise<Response> {
	const general = definition.refusal;
	for (const handler of definition.refusalByKind?.[refusal.kind] ?? []) {
		const reply = await answer(
			definition,
			handler,
			refusal,
			ctx,
			validateResponses,
		);
		if (reply !== undefined) return send(reply, set);
	}
	if (general !== undefined) {
		const reply = await answer(
			definition,
			general,
			refusal,
			ctx,
			validateResponses,
		);
		if (reply !== undefined) return send(reply, set);
	}
	return send(byDefault(refusal), set);
}

/** The reply of one handler, checked and with its content type; nothing when its hook returns nothing. */
async function answer(
	definition: RouteDefinition | SocketDefinition,
	handler: RefusalHandler,
	refusal: Refusal,
	ctx: BaseContext,
	validateResponses: boolean,
): Promise<AnyReply | undefined> {
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
		return withContentType(reply, handler.contentType);
	}
	if (reply !== undefined) {
		throw new TypeError(
			`${method} ${definition.path}: the onRefusal hook returned neither a reply nor nothing.`,
		);
	}
	return undefined;
}

/** The reply a refusal gets when no hook answers it. */
function byDefault(refusal: Refusal): Reply {
	switch (refusal.kind) {
		case 'validation': {
			const body: ValidationErrorBody = {
				error: 'validation',
				issues: refusal.issues,
			};
			return new Reply(400, body);
		}
		case 'body_limit': {
			const body: ContentTooLargeBody = {
				error: 'content_too_large',
				limit: refusal.limit,
			};
			return new Reply(413, body);
		}
	}
}

/** `reply` with `content-type` set to `type`, unless it sets one. */
function withContentType(reply: Reply, type: string | undefined): Reply {
	if (type === undefined) return reply;
	const headers = new Headers(reply.headers);
	if (headers.has('content-type')) return reply;
	headers.set('content-type', type);
	return new Reply(reply.status, reply.body, { headers });
}
