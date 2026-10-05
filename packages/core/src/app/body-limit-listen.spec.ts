/**
 * A body limit over a socket, and its refusal answered in a format of the
 * app's own by a try/catch middleware reading `refusalOf`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { refusalOf } from '../errors/errors';
import { problem } from '../reply/problem';
import { type AnyAlxia, alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
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

describe('bodyLimit under listen', () => {
	let app: AnyAlxia | undefined;
	afterEach(async () => {
		await app?.stop(true);
		app = undefined;
	});

	test('a Content-Length over it, and a body at it', async () => {
		app = alxia().post(
			'/notes',
			{ bodyLimit: 8 },
			validate({ body: z.string() }),
			({ body, reply }) => reply(200, body),
		);
		const server = app.listen(0);
		const over = await fetch(
			new URL('/notes', server.url),
			post('x'.repeat(4096)),
		);
		expect(over.status).toBe(413);
		expect(await over.json()).toEqual(tooLarge(8));
		const at = await fetch(new URL('/notes', server.url), post('12345678'));
		expect(await at.text()).toBe('12345678');
	});

	test('a raw upload streamed past 25 MiB is cut off there, its memory flat', async () => {
		const limit = 25 * 1024 * 1024;
		let counted = 0;
		app = alxia().post(
			'/upload',
			{ bodyLimit: limit },
			async ({ request, reply }) => {
				for await (const chunk of request.body ?? [])
					counted += chunk.byteLength;
				return reply(200, counted);
			},
		);
		const server = app.listen({
			port: 0,
			maxRequestBodySize: 1024 * 1024 * 1024,
		});
		const url = new URL('/upload', server.url);

		const exact = chunked(limit);
		expect(await (await fetch(url, post(exact.body))).json()).toBe(limit);

		counted = 0;
		Bun.gc(true);
		const before = process.memoryUsage().rss;
		const offered = 256 * 1024 * 1024;
		const over = chunked(offered);
		const response = await fetch(url, post(over.body));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(limit));
		const grown = process.memoryUsage().rss - before;
		// Measured: the handler counted 25 MiB, the client was pulled
		// 25.3 MiB of the 256 MiB offered, and the process grew by 2 MiB.
		expect(counted).toBeLessThanOrEqual(limit);
		expect(over.sent.bytes).toBeLessThan(limit + 8 * 1024 * 1024);
		expect(grown).toBeLessThan(limit);
	});
});

/** JMAP's answer to a request too large, and a 400 for one its schemas refuse. */
const jmap = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		const refusal = refusalOf(error);
		if (refusal === undefined) throw error;
		return refusal.kind === 'body_limit'
			? problem({
					type: 'urn:ietf:params:jmap:error:limit',
					status: 413,
					limit: 'maxSizeRequest',
				})
			: problem({
					type: 'urn:ietf:params:jmap:error:notRequest',
					status: 400,
					detail: `the ${refusal.part} is invalid`,
				});
	}
});

const JMAP_LIMIT = {
	type: 'urn:ietf:params:jmap:error:limit',
	status: 413,
	limit: 'maxSizeRequest',
};

/** An app whose refusals are JMAP problems: a JSON route and a raw upload, both limited, and one without a limit. */
function jmapApp() {
	return alxia()
		.use(jmap)
		.post(
			'/api',
			{ bodyLimit: 16 },
			validate({ body: z.unknown() }),
			({ reply }) => reply(200, 'ok'),
		)
		.post('/upload', { bodyLimit: 16 }, async ({ request, reply }) => {
			let bytes = 0;
			for await (const chunk of request.body ?? []) bytes += chunk.byteLength;
			return reply(200, bytes);
		})
		.post('/free', validate({ body: z.unknown() }), ({ reply }) =>
			reply(200, 'ok'),
		);
}

describe('a body_limit refusal answered by a middleware', () => {
	let listening: AnyAlxia | undefined;
	afterEach(async () => {
		await listening?.stop(true);
		listening = undefined;
	});

	const transports = {
		'app.request': () => {
			const app = jmapApp();
			return (path: string, init: RequestInit) => app.request(path, init);
		},
		listen: () => {
			const app = jmapApp();
			listening = app;
			const server = app.listen(0);
			return (path: string, init: RequestInit) =>
				fetch(new URL(path, server.url), init);
		},
	};

	for (const [name, open] of Object.entries(transports)) {
		test(`JMAP's 413, by problem(), on a JSON route and a raw stream, under ${name}`, async () => {
			const call = open();
			const big = JSON.stringify({ text: 'x'.repeat(64) });
			for (const path of ['/api', '/upload']) {
				const sized = await call(path, post(big, 'application/json'));
				expect(sized.status).toBe(413);
				expect(sized.headers.get('content-type')).toBe(
					'application/problem+json',
				);
				expect(await sized.json()).toEqual(JMAP_LIMIT);
				const streamed = await call(
					path,
					post(chunked(64, 8).body, 'application/json'),
				);
				expect(streamed.status).toBe(413);
				expect(await streamed.json()).toEqual(JMAP_LIMIT);
			}
			const fits = await call('/upload', post(chunked(16, 4).body));
			expect(await fits.json()).toBe(16);
			const invalid = await call('/api', post('{', 'application/json'));
			expect(invalid.status).toBe(400);
		});
	}
});
