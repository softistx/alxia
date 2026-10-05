import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Duplex } from 'node:stream';
import {
	brotliDecompressSync,
	constants,
	createBrotliCompress,
	gunzipSync,
	inflateSync,
	zstdDecompressSync,
} from 'node:zlib';
import { alxia } from '@alxia/core';
import { compress, type Encoding } from './compress';
import { BROTLI_QUALITY } from './flushing';

const encoder = new TextEncoder();
const SHELL = `<!DOCTYPE html><html><body><main>${'<p>the shell</p>'.repeat(20)}`;
const LATE = '<p>the deferred part</p></main></body></html>';
const PAUSE = 300;
/** Well before the pause: the first chunk did not wait for the second. */
const PROMPT = 150;

const ENCODINGS = ['zstd', 'br', 'gzip', 'deflate'] as const;

/**
 * Decodes `bytes`, which may stop at a flush: what was flushed decodes, and
 * the stream need not have ended.
 */
function decode(encoding: Encoding, bytes: Uint8Array): string {
	const decoded = {
		gzip: () => gunzipSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH }),
		deflate: () => inflateSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH }),
		br: () =>
			brotliDecompressSync(bytes, {
				finishFlush: constants.BROTLI_OPERATION_FLUSH,
			}),
		zstd: () => zstdDecompressSync(bytes),
	}[encoding]();
	return decoded.toString();
}

/** What the sources were told when their reader left. */
const cancelled: unknown[] = [];

/** The shell at once, the rest after `PAUSE`, or an error instead of it. */
function page(fail = false): ReadableStream<Uint8Array> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(SHELL));
			timer = setTimeout(() => {
				if (fail) return controller.error(new Error('the render failed'));
				controller.enqueue(encoder.encode(LATE));
				controller.close();
			}, PAUSE);
		},
		cancel(reason) {
			clearTimeout(timer);
			cancelled.push(reason);
		},
	});
}

const html = { 'content-type': 'text/html;charset=utf-8' };
const app = alxia()
	.use(compress({ threshold: 0 }))
	.get('/page', ({ reply }) => reply(200, page(), { headers: html }))
	.get('/broken', ({ reply }) => reply(200, page(true), { headers: html }))
	.get('/whole', ({ reply }) => reply(200, SHELL + LATE, { headers: html }))
	.get('/measured', ({ reply }) =>
		reply(200, page(), {
			headers: {
				...html,
				'content-length': String(encoder.encode(SHELL + LATE).byteLength),
			},
		}),
	);

/** The bytes of `body` with the time each arrived, from `since`. */
async function timed(body: ReadableStream<Uint8Array>, since: number) {
	const chunks: { at: number; bytes: Uint8Array }[] = [];
	for await (const bytes of body) {
		chunks.push({ at: performance.now() - since, bytes });
	}
	return chunks;
}

/** The first chunk leaves before the pause, and both decode. */
function expectStreamed(
	encoding: Encoding,
	chunks: { at: number; bytes: Uint8Array }[],
) {
	const first = chunks[0];
	expect(first).toBeDefined();
	expect(first?.at).toBeLessThan(PROMPT);
	const early = Buffer.concat(
		chunks.filter(({ at }) => at < PROMPT).map(({ bytes }) => bytes),
	);
	expect(decode(encoding, early)).toBe(SHELL);
	const all = Buffer.concat(chunks.map(({ bytes }) => bytes));
	expect(decode(encoding, all)).toBe(SHELL + LATE);
	expect(chunks.at(-1)?.at).toBeGreaterThanOrEqual(PAUSE - 20);
}

const unhandled: unknown[] = [];
const record = (error: unknown) => unhandled.push(error);
beforeAll(() => process.on('unhandledRejection', record));
afterAll(() => {
	process.off('unhandledRejection', record);
});

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

describe('errors and cancellation', () => {
	test('a source that fails errors the body, after what it had sent', async () => {
		const response = await app.request('/broken', {
			headers: { 'accept-encoding': 'gzip' },
		});
		const reader = response.body?.getReader();
		if (reader === undefined) throw new Error('no body');
		// gzip's header may come as a chunk of its own.
		const sent: Uint8Array[] = [];
		while (decode('gzip', Buffer.concat(sent)) !== SHELL) {
			const { value } = await reader.read();
			if (value === undefined) throw new Error('ended early');
			sent.push(value);
		}
		await expect(reader.read()).rejects.toThrow('the render failed');
	});

	test('a source that fails through listen ends the response, and the server keeps serving', async () => {
		const server = app.listen({ port: 0 });
		try {
			const response = await fetch(new URL('/broken', server.url), {
				headers: { 'accept-encoding': 'zstd' },
				decompress: false,
			});
			// The connection is closed with the body cut short. Bun.serve
			// prints the source's error, as it does with no compression.
			await expect(response.arrayBuffer()).rejects.toThrow();
			const next = await fetch(new URL('/whole', server.url), {
				headers: { 'accept-encoding': 'zstd' },
				decompress: false,
			});
			expect(decode('zstd', new Uint8Array(await next.arrayBuffer()))).toBe(
				SHELL + LATE,
			);
		} finally {
			await app.stop(true);
		}
	});

	test('a reader that cancels cancels the source', async () => {
		cancelled.length = 0;
		const response = await app.request('/page', {
			headers: { 'accept-encoding': 'br' },
		});
		const reader = response.body?.getReader();
		if (reader === undefined) throw new Error('no body');
		await reader.read();
		await reader.cancel('gone');
		expect(cancelled).toEqual(['gone']);
	});

	test('a client that aborts through listen cancels the source', async () => {
		cancelled.length = 0;
		const server = app.listen({ port: 0 });
		try {
			const abort = new AbortController();
			const response = await fetch(new URL('/page', server.url), {
				headers: { 'accept-encoding': 'gzip' },
				decompress: false,
				signal: abort.signal,
			});
			const reader = response.body?.getReader();
			if (reader === undefined) throw new Error('no body');
			await reader.read();
			abort.abort();
			await reader.read().catch(() => undefined);
			for (let i = 0; i < 50 && cancelled.length === 0; i++)
				await Bun.sleep(10);
			expect(cancelled).toHaveLength(1);
		} finally {
			await app.stop(true);
		}
	});

	test('no rejection went unhandled', async () => {
		// Long enough for every source's timer of the tests above to fire.
		await Bun.sleep(PAUSE + 50);
		expect(unhandled).toEqual([]);
	});
});
