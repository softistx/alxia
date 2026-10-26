/**
 * A declared `Content-Length` over the limit is refused where `bodyLimit()`
 * stands: the middlewares before it run, the ones after it and the handler
 * do not, and no byte is read. Every request here sets its `content-length`:
 * Bun's `Request` sets none, and without it the count at read time decides.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
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

/** A body of `total` bytes that counts what was pulled, declared as `total`. */
function counting(total: number) {
	const sent = { bytes: 0 };
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent.bytes >= total) return controller.close();
			sent.bytes += 16;
			controller.enqueue(new Uint8Array(16).fill(97));
		},
	});
	return { sent, init: declared(body, String(total)) };
}

const echo = ({ reply }: { reply: (status: 200, body: string) => AnyReply }) =>
	reply(200, 'ok');

describe('where bodyLimit() stands', () => {
	test('the middlewares before it run, the ones after it and the handler do not', async () => {
		const ran: string[] = [];
		const app = alxia()
			.use(note(ran, 'before'))
			.bodyLimit(8)
			.use(note(ran, 'after'))
			.post('/x', ({ reply }) => {
				ran.push('handler');
				return reply(200, 'ok');
			});
		const response = await app.request('/x', sized(9));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
		expect(ran).toEqual(['before']);
	});

	test('the body is not pulled', async () => {
		const app = alxia()
			.bodyLimit(8)
			.post('/x', ({ reply }) => reply(200, 'ok'));
		const { sent, init } = counting(1024);
		expect((await app.request('/x', init)).status).toBe(413);
		expect(sent.bytes).toBeLessThanOrEqual(16);
	});

	test('a length at the limit passes, a chunked body over it is cut at the read', async () => {
		const ran: string[] = [];
		const app = alxia()
			.bodyLimit(8)
			.use(note(ran, 'after'))
			.post('/x', validate({ body: z.string() }), ({ body, reply }) =>
				reply(200, body),
			);
		const at = await app.request('/x', sized(8));
		expect(at.status).toBe(200);
		expect(ran).toEqual(['after']);
		const chunked = await app.request('/x', {
			method: 'POST',
			body: text(9),
			headers: { 'content-type': 'text/plain' },
		});
		expect(chunked.status).toBe(413);
		expect(ran).toEqual(['after', 'after']);
	});

	test('a group: the steps before its bodyLimit() run, the ones after do not, routes outside are free', async () => {
		const ran: string[] = [];
		const app = alxia()
			.use(note(ran, 'a'))
			.group('/g', (group) =>
				group
					.use(note(ran, 'b'))
					.bodyLimit(8)
					.use(note(ran, 'c'))
					.post('/x', echo),
			)
			.post('/free', echo);
		expect((await app.request('/g/x', sized(9))).status).toBe(413);
		expect(ran).toEqual(['a', 'b']);
		ran.length = 0;
		expect((await app.request('/free', sized(99))).status).toBe(200);
		expect(ran).toEqual(['a']);
	});

	test("a route's own bodyLimit option refuses at the head of its own steps", async () => {
		const ran: string[] = [];
		const app = alxia()
			.use(note(ran, 'a'))
			.post('/x', { bodyLimit: 8 }, note(ran, 'b'), echo);
		expect((await app.request('/x', sized(9))).status).toBe(413);
		expect(ran).toEqual(['a']);
	});

	test('the option overrides the app limit: refused at the option, after the app steps', async () => {
		const ran: string[] = [];
		const app = alxia()
			.bodyLimit(8)
			.use(note(ran, 'a'))
			.post('/up', { bodyLimit: 64 }, echo);
		expect((await app.request('/up', sized(9))).status).toBe(200);
		expect((await app.request('/up', sized(65))).status).toBe(413);
		expect(ran).toEqual(['a', 'a']);
	});

	test('the last bodyLimit() wins: the check stands there, with its limit', async () => {
		const ran: string[] = [];
		const app = alxia()
			.bodyLimit(64)
			.use(note(ran, 'a'))
			.bodyLimit(8)
			.use(note(ran, 'b'))
			.post('/x', echo);
		expect((await app.request('/x', sized(9))).status).toBe(413);
		expect(ran).toEqual(['a']);
	});
});

describe('a plugin', () => {
	test("the app's bodyLimit() never refuses a plugin route that has none", async () => {
		const plugin = alxia().post('/free', echo);
		const host = alxia().bodyLimit(4).plugin(plugin);
		expect((await host.request('/free', sized(9))).status).toBe(200);
	});

	test("a plugin's own limit is honoured where it declared it", async () => {
		const ran: string[] = [];
		const plugin = alxia()
			.bodyLimit(8)
			.use(note(ran, 'inside'))
			.post('/own', echo);
		const host = alxia().use(note(ran, 'app')).plugin(plugin);
		expect((await host.request('/own', sized(9))).status).toBe(413);
		expect(ran).toEqual(['app']);
		expect((await host.request('/own', sized(8))).status).toBe(200);
	});
});
