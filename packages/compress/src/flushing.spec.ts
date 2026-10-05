import { describe, expect, test } from 'bun:test';
import { Duplex } from 'node:stream';
import { constants, createBrotliCompress } from 'node:zlib';
import { alxia } from '@alxia/core';
import {
	app,
	decode,
	ENCODINGS,
	encoder,
	expectStreamed,
	html,
	LATE,
	PAUSE,
	PROMPT,
	SHELL,
	timed,
} from '../test/flushing-helpers';
import { compress } from './compress';
import { BROTLI_QUALITY } from './flushing';

describe('a streamed body is flushed as it comes', () => {
	for (const encoding of ENCODINGS) {
		test(`${encoding}, through app.request`, async () => {
			const since = performance.now();
			const response = await app.request('/page', {
				headers: { 'accept-encoding': encoding },
			});
			expect(response.headers.get('content-encoding')).toBe(encoding);
			if (response.body === null) throw new Error('no body');
			expectStreamed(encoding, await timed(response.body, since));
		});

		test(`${encoding}, through listen and fetch`, async () => {
			const server = app.listen({ port: 0 });
			try {
				const since = performance.now();
				const response = await fetch(new URL('/page', server.url), {
					headers: { 'accept-encoding': encoding },
					decompress: false,
				});
				expect(response.headers.get('content-encoding')).toBe(encoding);
				if (response.body === null) throw new Error('no body');
				expectStreamed(encoding, await timed(response.body, since));
			} finally {
				await app.stop(true);
			}
		});
	}

	test('the chunks of one turn share one flush', async () => {
		const rows = Array.from(
			{ length: 200 },
			(_, i) => `<tr><td>${i}</td><td>Product ${i}</td></tr>`,
		);
		const stream = (spread: boolean) =>
			alxia()
				.use(compress())
				.get('/rows', ({ reply }) =>
					reply(
						200,
						new ReadableStream<Uint8Array>({
							async start(controller) {
								for (const row of rows) {
									controller.enqueue(encoder.encode(row));
									if (spread) await new Promise((r) => setImmediate(r));
								}
								controller.close();
							},
						}),
						{ headers: html },
					),
				)
				.request('/rows', { headers: { 'accept-encoding': 'gzip' } })
				.then((response) => response.arrayBuffer());
		const together = new Uint8Array(await stream(false));
		const apart = new Uint8Array(await stream(true));
		expect(decode('gzip', together)).toBe(rows.join(''));
		expect(decode('gzip', apart)).toBe(rows.join(''));
		// A flush per row costs bytes; one for the whole turn almost none.
		expect(together.byteLength).toBeLessThan(apart.byteLength * 0.6);
	});

	test('an event stream, when compressible says so, gets each event at once', async () => {
		const events = alxia()
			.use(compress({ compressible: () => true }))
			.get('/ticks', ({ reply }) =>
				reply(
					200,
					(async function* () {
						yield { n: 1 };
						await Bun.sleep(PAUSE);
						yield { n: 2 };
					})(),
				),
			);
		const since = performance.now();
		const response = await events.request('/ticks', {
			headers: { 'accept-encoding': 'br' },
		});
		expect(response.headers.get('content-encoding')).toBe('br');
		if (response.body === null) throw new Error('no body');
		const chunks = await timed(response.body, since);
		expect(chunks[0]?.at).toBeLessThan(PROMPT);
		const early = Buffer.concat(
			chunks.filter(({ at }) => at < PROMPT).map(({ bytes }) => bytes),
		);
		expect(decode('br', early)).toBe('data: {"n":1}\n\n');
		const all = Buffer.concat(chunks.map(({ bytes }) => bytes));
		expect(decode('br', all)).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
	});
});

describe('a body with a length is compressed whole, as before', () => {
	for (const encoding of ['gzip', 'br'] as const) {
		test(`${encoding}: a stream with a Content-Length is not flushed`, async () => {
			const since = performance.now();
			const response = await app.request('/measured', {
				headers: { 'accept-encoding': encoding },
			});
			expect(response.headers.get('content-encoding')).toBe(encoding);
			if (response.body === null) throw new Error('no body');
			const chunks = await timed(response.body, since);
			const early = Buffer.concat(
				chunks.filter(({ at }) => at < PROMPT).map(({ bytes }) => bytes),
			);
			expect(decode(encoding, early)).toBe('');
			const all = Buffer.concat(chunks.map(({ bytes }) => bytes));
			expect(decode(encoding, all)).toBe(SHELL + LATE);
		});
	}

	test('gzip: the same bytes as CompressionStream over the body', async () => {
		const response = await app.request('/whole', {
			headers: { 'accept-encoding': 'gzip' },
		});
		expect(response.headers.get('content-encoding')).toBe('gzip');
		const expected = await new Response(
			new Blob([SHELL + LATE])
				.stream()
				.pipeThrough(new CompressionStream('gzip')),
		).arrayBuffer();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array(expected),
		);
	});

	test('br: the same bytes as the Brotli duplex at quality 4', async () => {
		const response = await app.request('/whole', {
			headers: { 'accept-encoding': 'br' },
		});
		const brotli = Duplex.toWeb(
			createBrotliCompress({
				params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
			}),
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
		const expected = await new Response(
			new Blob([SHELL + LATE]).stream().pipeThrough(brotli),
		).arrayBuffer();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array(expected),
		);
	});
});
