/**
 * Helpers of the specs of a declared oversize body: every request sets its
 * `content-length` itself, since Bun's `Request` sets none.
 */
import { defineMiddleware } from '../../src/app/define-middleware';
import type { AnyReply } from '../../src/reply/reply';

export const tooLarge = (limit: number) => ({
	error: 'content_too_large',
	limit,
});

/** A POST of `body` with `length` declared, as a client sends it. */
export const declared = (
	body: string | ReadableStream<Uint8Array>,
	length: string,
) =>
	({
		method: 'POST',
		body,
		headers: { 'content-type': 'text/plain', 'content-length': length },
		duplex: 'half',
	}) as RequestInit;

export const text = (size: number) => 'x'.repeat(size);
export const sized = (size: number) => declared(text(size), String(size));

/** A middleware noting its name in `ran`. */
export const note = (ran: string[], name: string) =>
	defineMiddleware((_ctx, next) => {
		ran.push(name);
		return next();
	});

export const echo = ({
	reply,
}: {
	reply: (status: 200, body: string) => AnyReply;
}) => reply(200, 'ok');
