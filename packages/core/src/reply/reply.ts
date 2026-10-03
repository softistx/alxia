import { isAsyncIterable } from '../sse/async-iterable';
import { toEventStream } from '../sse/event-stream';
import { BODILESS, type StatusCode } from '../types/status';

export interface ReplyInit {
	/**
	 * Headers added to this reply, over those set on `ctx.set.headers` —
	 * except `Vary`, whose names are added to theirs.
	 */
	readonly headers?: HeadersInit;
}

/**
 * What a handler returns: a status and the body sent with it. Its type is the
 * route's contract — the client reads the union of every `Reply` a handler
 * may return.
 *
 * Built by `ctx.reply(status, body)`, which checks the body against the
 * schema the route declares for that status.
 */
export class Reply<Status extends number = number, Body = unknown> {
	/**
	 * Never set: makes a `Reply` nominal. Without it a `Response` — a
	 * `status`, a `body`, `headers` — would pass for one, and a hook that
	 * returns either would type its `Response` as a reply.
	 */
	declare readonly '~reply': true;
	readonly status: Status;
	readonly body: Body;
	readonly headers: HeadersInit | undefined;

	constructor(status: Status, body: Body, init?: ReplyInit) {
		this.status = status;
		this.body = body;
		this.headers = init?.headers;
	}
}

/** Any reply, whatever its status and body. */
export type AnyReply = Reply<any, any>;

/**
 * The statuses `reply` has a shortcut for: `reply.ok(body)` is
 * `reply(200, body)`. `noContent` takes no body.
 */
export const SHORTCUTS = {
	ok: 200,
	created: 201,
	accepted: 202,
	noContent: 204,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
} as const;

/** The status a shortcut answers: `Shortcuts['notFound']` is `404`. */
export type Shortcuts = typeof SHORTCUTS;

/** The shortcuts of `reply` without schemas: any body, its type kept. */
export type FreeShortcuts = {
	readonly [Name in keyof Shortcuts]: Name extends 'noContent'
		? (init?: ReplyInit) => Reply<204, undefined>
		: <const Body = undefined>(
				body?: Body,
				init?: ReplyInit,
			) => Reply<Shortcuts[Name], Body>;
} & {
	/** An HTML page: the body sent as `text/html;charset=utf-8`. */
	readonly html: <const Status extends StatusCode>(
		status: Status,
		html: string,
		init?: ReplyInit,
	) => Reply<Status, string>;
};

/**
 * `reply` without schemas: any status, any body. The body's type is kept, so
 * the client still reads it. Its shortcuts — `reply.ok(body)`,
 * `reply.notFound(body)`, `reply.noContent()` — are the same replies.
 */
export type FreeReplyFunction = (<
	const Status extends StatusCode,
	const Body = undefined,
>(
	status: Status,
	body?: Body,
	init?: ReplyInit,
) => Reply<Status, Body>) &
	FreeShortcuts;

/** `init`'s headers, with `content-type` set unless they set one. */
function withContentType(type: string, init?: ReplyInit): ReplyInit {
	const headers = new Headers(init?.headers);
	if (!headers.has('content-type')) headers.set('content-type', type);
	return { ...init, headers };
}

/** A shortcut: `reply(status, body, init)` with its status fixed. */
const shortcut =
	<const Status extends StatusCode>(status: Status) =>
	<const Body = undefined>(body?: Body, init?: ReplyInit) =>
		new Reply(status, body as Body, init);

const shortcuts = {
	ok: shortcut(SHORTCUTS.ok),
	created: shortcut(SHORTCUTS.created),
	accepted: shortcut(SHORTCUTS.accepted),
	noContent: (init?: ReplyInit) =>
		new Reply(SHORTCUTS.noContent, undefined, init),
	badRequest: shortcut(SHORTCUTS.badRequest),
	unauthorized: shortcut(SHORTCUTS.unauthorized),
	forbidden: shortcut(SHORTCUTS.forbidden),
	notFound: shortcut(SHORTCUTS.notFound),
	conflict: shortcut(SHORTCUTS.conflict),
	html: <const Status extends StatusCode>(
		status: Status,
		html: string,
		init?: ReplyInit,
	) =>
		new Reply(status, html, withContentType('text/html;charset=utf-8', init)),
} satisfies FreeShortcuts;

export const createReply: FreeReplyFunction = Object.assign(
	<const Status extends StatusCode, const Body = undefined>(
		status: Status,
		body?: Body,
		init?: ReplyInit,
	) => new Reply(status, body as Body, init),
	shortcuts,
);

const BINARY = (value: unknown): value is BodyInit =>
	value instanceof Blob ||
	value instanceof ReadableStream ||
	value instanceof ArrayBuffer ||
	ArrayBuffer.isView(value) ||
	value instanceof FormData ||
	value instanceof URLSearchParams;

/**
 * The `Response` a reply is sent as. A string is `text/plain`, a binary body
 * goes as it is, an async iterable is a stream of server-sent events, and
 * anything else is JSON. A body-less status sends none.
 */
export function toResponse(
	status: number,
	body: unknown,
	headers: Headers,
	signal?: AbortSignal,
): Response {
	if (BODILESS.has(status) || body === undefined) {
		return new Response(null, { status, headers });
	}
	if (typeof body === 'string') {
		if (!headers.has('content-type'))
			headers.set('content-type', 'text/plain;charset=utf-8');
		headers.set('content-length', String(Buffer.byteLength(body)));
		return new Response(body, { status, headers });
	}
	if (BINARY(body)) {
		// Known up front, so `onResponse` (compress's threshold) can read it.
		const length =
			body instanceof Blob
				? body.size
				: body instanceof ArrayBuffer || ArrayBuffer.isView(body)
					? body.byteLength
					: undefined;
		if (length !== undefined && !headers.has('content-length'))
			headers.set('content-length', String(length));
		return new Response(body, { status, headers });
	}
	if (isAsyncIterable(body)) {
		headers.set('content-type', 'text/event-stream');
		headers.set('cache-control', 'no-cache');
		headers.set('x-accel-buffering', 'no');
		return new Response(toEventStream(body, signal), { status, headers });
	}
	if (!headers.has('content-type'))
		headers.set('content-type', 'application/json');
	const json = JSON.stringify(body);
	headers.set('content-length', String(Buffer.byteLength(json)));
	return new Response(json, { status, headers });
}
