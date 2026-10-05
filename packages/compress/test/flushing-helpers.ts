import { expect } from 'bun:test';
import {
	brotliDecompressSync,
	constants,
	gunzipSync,
	inflateSync,
	zstdDecompressSync,
} from 'node:zlib';
import { alxia } from '@alxia/core';
import { compress, type Encoding } from '../src/compress';

export const encoder = new TextEncoder();
export const SHELL = `<!DOCTYPE html><html><body><main>${'<p>the shell</p>'.repeat(20)}`;
export const LATE = '<p>the deferred part</p></main></body></html>';
export const PAUSE = 300;
/** Well before the pause: the first chunk did not wait for the second. */
export const PROMPT = 150;

export const ENCODINGS = ['zstd', 'br', 'gzip', 'deflate'] as const;

/**
 * Decodes `bytes`, which may stop at a flush: what was flushed decodes, and
 * the stream need not have ended.
 */
export function decode(encoding: Encoding, bytes: Uint8Array): string {
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
export const cancelled: unknown[] = [];

/** The shell at once, the rest after `PAUSE`, or an error instead of it. */
export function page(fail = false): ReadableStream<Uint8Array> {
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

export const html = { 'content-type': 'text/html;charset=utf-8' };
export const app = alxia()
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
export async function timed(body: ReadableStream<Uint8Array>, since: number) {
	const chunks: { at: number; bytes: Uint8Array }[] = [];
	for await (const bytes of body) {
		chunks.push({ at: performance.now() - since, bytes });
	}
	return chunks;
}

/** The first chunk leaves before the pause, and both decode. */
export function expectStreamed(
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
