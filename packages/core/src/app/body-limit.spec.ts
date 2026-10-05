import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { ContentTooLargeError } from '../errors/errors';
import { alxia } from './alxia';
import { validate } from './validate';

const tooLarge = (limit: number) => ({ error: 'content_too_large', limit });

/** A body of `total` bytes sent in `chunk`-byte pieces, with no `Content-Length`, counting what was pulled. */
function chunked(total: number, chunk = 64 * 1024) {
	const piece = new Uint8Array(chunk).fill(97);
	const sent = { bytes: 0 };
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const left = total - sent.bytes;
			if (left <= 0) return controller.close();
			const next = left < chunk ? piece.subarray(0, left) : piece;
			sent.bytes += next.byteLength;
			controller.enqueue(next);
		},
	});
	return { body, sent };
}

const post = (body: BodyInit, type = 'text/plain'): RequestInit =>
	({
		method: 'POST',
		body,
		headers: { 'content-type': type },
		duplex: 'half',
	}) as RequestInit;

describe('bodyLimit on a route', () => {
	const app = alxia().post(
		'/notes',
		{ bodyLimit: 8 },
		validate({ body: z.string() }),
		({ body, reply }) => reply(200, body),
	);

	test('a body under the limit, or exactly at it, is read', async () => {
		const under = await app.request('/notes', post('1234567'));
		expect(under.status).toBe(200);
		expect(await under.text()).toBe('1234567');
		const at = await app.request('/notes', post('12345678'));
		expect(at.status).toBe(200);
		expect(await at.text()).toBe('12345678');
	});

	test('a Content-Length over the limit is a 413, the body unread', async () => {
		const { body, sent } = chunked(1024, 16);
		const response = await app.request('/notes', {
			...post(body),
			headers: { 'content-type': 'text/plain', 'content-length': '1024' },
		});
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
		// A stream pulls its first chunk as it is made; nothing past it is read.
		expect(sent.bytes).toBeLessThanOrEqual(16);
	});

	test('a body one byte over the limit, with no Content-Length, is a 413', async () => {
		const { body } = chunked(9, 4);
		const response = await app.request('/notes', post(body));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
	});

	test('a chunked body over the limit stops being read once it passes it', async () => {
		const limit = 1024 * 1024;
		const big = alxia().post(
			'/big',
			{ bodyLimit: limit },
			validate({ body: z.string() }),
			({ reply }) => reply(200, 'read'),
		);
		const { body, sent } = chunked(64 * 1024 * 1024);
		const response = await big.request('/big', post(body));
		expect(response.status).toBe(413);
		// Measured: 1 MiB + one 64 KiB chunk past it, of the 64 MiB offered.
		expect(sent.bytes).toBeLessThan(limit + 4 * 64 * 1024);
	});
});

describe('bodyLimit on a route, whatever reads the body', () => {
	test('JSON, forms and a custom parser are bounded alike', async () => {
		const parsed = alxia()
			.parser('application/x-ndjson', async (request) =>
				(await request.text()).split('\n'),
			)
			.bodyLimit(16)
			.post('/json', validate({ body: z.unknown() }), ({ reply }) =>
				reply(200, 'ok'),
			)
			.post('/form', validate({ body: z.unknown() }), ({ reply }) =>
				reply(200, 'ok'),
			)
			.post('/ndjson', validate({ body: z.unknown() }), ({ reply }) =>
				reply(200, 'ok'),
			);
		const json = JSON.stringify({ text: 'x'.repeat(32) });
		const form = new URLSearchParams({ text: 'x'.repeat(32) }).toString();
		for (const [path, body, type] of [
			['/json', json, 'application/json'],
			['/form', form, 'application/x-www-form-urlencoded'],
			['/ndjson', 'a\nb\nc\nd\ne\nf\ng\nh\ni', 'application/x-ndjson'],
		] as const) {
			const sized = await parsed.request(path, post(body, type));
			expect(sized.status).toBe(413);
			const { body: stream } = chunked(body.length, 4);
			const streamed = await parsed.request(path, post(stream, type));
			expect(streamed.status).toBe(413);
			expect(await streamed.json()).toEqual(tooLarge(16));
		}
		const small = await parsed.request('/json', post('{}', 'application/json'));
		expect(small.status).toBe(200);
	});

	test('a handler reading the raw stream is bounded too', async () => {
		const raw = alxia().post(
			'/upload',
			{ bodyLimit: 10 },
			async ({ request, reply }) => {
				let bytes = 0;
				for await (const chunk of request.body ?? []) bytes += chunk.byteLength;
				return reply(200, bytes);
			},
		);
		const under = await raw.request('/upload', post(chunked(10, 3).body));
		expect(await under.json()).toBe(10);
		const over = await raw.request('/upload', post(chunked(11, 3).body));
		expect(over.status).toBe(413);
		expect(await over.json()).toEqual(tooLarge(10));
	});
});

describe('bodyLimit on a route, with the middlewares around it', () => {
	test('the refusal reaches a try/catch middleware as a ContentTooLargeError', async () => {
		const caught: unknown[] = [];
		const app = alxia()
			.use(async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					caught.push(error);
					throw error;
				}
			})
			.post(
				'/api',
				{ bodyLimit: 2 },
				validate({ body: z.unknown() }),
				({ reply }) => reply(200, 'ok'),
			);
		const response = await app.request(
			'/api',
			post('[1, 2]', 'application/json'),
		);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(2));
		expect(caught).toHaveLength(1);
		expect(caught[0]).toBeInstanceOf(ContentTooLargeError);
	});

	test('a body a middleware already read is left as it is', async () => {
		const read = alxia()
			.use(async ({ request }, next) => {
				await request.text();
				return next();
			})
			.post('/x', { bodyLimit: 100 }, ({ reply }) => reply(200, 'ok'));
		const response = await read.request('/x', post('12345'));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});

	test('a limit that is not a number is a compile error', () => {
		const app = alxia();
		expect(() =>
			// @ts-expect-error: bodyLimit is a number of bytes
			app.post('/a', { bodyLimit: '1mb' }, ({ reply }) => reply(200, 'a')),
		).toThrow(TypeError);
		// @ts-expect-error: bodyLimit() takes a number of bytes
		expect(() => app.bodyLimit('1mb')).toThrow(TypeError);
	});

	test('a limit that is not a whole number of bytes is refused', () => {
		expect(() =>
			alxia().post('/a', { bodyLimit: -1 }, ({ reply }) => reply(200, 'a')),
		).toThrow('POST /a: bodyLimit must be a whole number of bytes');
		expect(() => alxia().bodyLimit(1.5)).toThrow(
			'bodyLimit(): bodyLimit must be a whole number of bytes',
		);
	});
});

describe('without a bodyLimit', () => {
	test('nothing changes: the request is the one received, and its type has no 413', async () => {
		let seen: Request | undefined;
		const app = alxia()
			.derive(({ request }) => {
				seen = request;
				return {};
			})
			.post('/notes', validate({ body: z.string() }), ({ body, reply }) =>
				reply(200, body.length),
			);
		const request = new Request(
			'http://localhost/notes',
			post('x'.repeat(4096)),
		);
		const response = await app.fetch(request);
		expect(await response.json()).toBe(4096);
		expect(seen).toBe(request);
	});
});
