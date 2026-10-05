import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	app,
	cancelled,
	decode,
	LATE,
	PAUSE,
	SHELL,
} from '../test/flushing-helpers';

const unhandled: unknown[] = [];
const record = (error: unknown) => unhandled.push(error);
beforeAll(() => process.on('unhandledRejection', record));
afterAll(() => {
	process.off('unhandledRejection', record);
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
