/**
 * The refusal of a declared oversize body: what a catcher before the step
 * sees, the problem format, a length that is not digits, and the requests
 * no route serves. Every request sets its `content-length`.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ContentTooLargeError, refusalOf } from '../errors/errors';
import type { AnyReply } from '../reply/reply';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

const tooLarge = (limit: number) => ({ error: 'content_too_large', limit });

/** A request of `body` with `length` declared, as a client sends it. */
const declared = (body: string | ReadableStream<Uint8Array>, length: string) =>
	({
		method: 'POST',
		body,
		headers: { 'content-type': 'text/plain', 'content-length': length },
		duplex: 'half',
	}) as RequestInit;

const text = (size: number) => 'x'.repeat(size);
const sized = (size: number) => declared(text(size), String(size));

/** A middleware noting its name in `ran`. */
const note = (ran: string[], name: string) =>
	defineMiddleware((_ctx, next) => {
		ran.push(name);
		return next();
	});

const echo = ({ reply }: { reply: (status: 200, body: string) => AnyReply }) =>
	reply(200, 'ok');

describe('the refusal', () => {
	test('a catcher before it sees a ContentTooLargeError and refusalOf reads it', async () => {
		const seen: unknown[] = [];
		const app = alxia()
			.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					seen.push(error);
					throw error;
				}
			})
			.bodyLimit(8)
			.post('/x', echo);
		expect((await app.request('/x', sized(9))).status).toBe(413);
		expect(seen[0]).toBeInstanceOf(ContentTooLargeError);
		expect(refusalOf(seen[0])).toEqual({ kind: 'body_limit', limit: 8 });
	});

	test("errors: 'problem' answers application/problem+json", async () => {
		const app = alxia({ errors: 'problem' }).bodyLimit(8).post('/x', echo);
		const response = await app.request('/x', sized(9));
		expect(response.status).toBe(413);
		expect(response.headers.get('content-type')).toContain(
			'application/problem+json',
		);
	});

	test('a catcher after bodyLimit() does not catch it: the default 413 applies', async () => {
		const caught: unknown[] = [];
		const app = alxia()
			.bodyLimit(8)
			.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					caught.push(error);
					throw error;
				}
			})
			.post('/x', echo);
		const response = await app.request('/x', sized(9));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
		expect(caught).toEqual([]);
	});
});

describe('a declared length that is not digits', () => {
	const app = (ran: string[]) =>
		alxia()
			.bodyLimit(8)
			.use(note(ran, 'after'))
			.post('/x', validate({ body: z.string() }), ({ reply }) =>
				reply(200, 'read'),
			);

	test.each(['-1', 'abc', '', '1e3', '0x10', '8, 8'])(
		'%j is not refused early: the count at the read decides',
		async (length) => {
			const ran: string[] = [];
			const response = await app(ran).request('/x', declared(text(9), length));
			expect(ran).toEqual(['after']);
			expect(response.status).not.toBe(200);
		},
	);

	test('a length too big for a safe integer is refused early', async () => {
		const ran: string[] = [];
		const response = await app(ran).request(
			'/x',
			declared(text(9), '99999999999999999999'),
		);
		expect(response.status).toBe(413);
		expect(ran).toEqual([]);
	});
});

describe('requests no route serves', () => {
	test('a 404, a 405 and a socket carry no bodyLimit() step', async () => {
		const ran: string[] = [];
		const app = alxia({ dev: true })
			.bodyLimit(8)
			.use(note(ran, 'after'))
			.post('/x', echo)
			.ws('/chat', { message: () => {} });
		const missing = await app.request('/nope', sized(99));
		expect(missing.status).toBe(404);
		const wrong = await app.request('/x', { ...sized(99), method: 'PUT' });
		expect(wrong.status).toBe(405);
		expect(ran).toEqual(['after', 'after']);
	});

	test('the 404 hint still names a limited route, the table shows bodyLimit', async () => {
		const app = alxia({ dev: true }).bodyLimit(8).post('/notes', echo);
		const missing = await app.request('/note', sized(1));
		expect(await missing.json()).toEqual({
			error: 'not_found',
			hint: 'did you mean POST /notes?',
		});
	});
});
