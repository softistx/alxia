import { afterAll, describe, expect, test } from 'bun:test';
import { alxia, eventStream, responds } from '@alxia/core';
import { z } from 'zod';
import { type LogEntry, logger } from './logger';

const encoder = new TextEncoder();

/** A body of five chunks, one every 40 ms: 200 ms in all. */
function slow(): ReadableStream<Uint8Array> {
	let sent = 0;
	return new ReadableStream({
		async pull(controller) {
			await Bun.sleep(40);
			controller.enqueue(encoder.encode(`chunk ${sent}\n`));
			if (++sent === 5) controller.close();
		},
	});
}

/** A body that sends one chunk, then fails. */
function failing(): ReadableStream<Uint8Array> {
	let sent = false;
	return new ReadableStream({
		async pull(controller) {
			await Bun.sleep(20);
			if (sent) {
				controller.error(new Error('renderer crashed'));
				return;
			}
			sent = true;
			controller.enqueue(encoder.encode('shell\n'));
		},
	});
}

/** An event stream that never ends on its own, and says when it is released. */
const Tick = eventStream(z.object({ n: z.number() }));
const released: string[] = [];
async function* ticks(): AsyncGenerator<{ n: number }> {
	try {
		for (let n = 0; ; n++) {
			yield { n };
			await Bun.sleep(20);
		}
	} finally {
		released.push('ticks');
	}
}

async function until(done: () => boolean): Promise<void> {
	for (let i = 0; i < 200 && !done(); i++) await Bun.sleep(5);
}

describe('a streamed body', () => {
	const entries: LogEntry[] = [];
	const app = alxia()
		.use(logger({ write: (entry) => entries.push(entry) }))
		.get('/slow', ({ reply }) => reply(200, slow()))
		.get('/failing', ({ reply }) => reply(200, failing()))
		.get('/ticks', responds({ 200: Tick }), ({ reply }) => reply(200, ticks()))
		.get('/text', ({ reply }) => reply(200, 'hello'));
	const server = app.listen({ port: 0 });
	const base = `http://127.0.0.1:${server.port}`;
	afterAll(() => server.stop(true));

	const entryFor = (path: string) =>
		entries.find((entry) => entry.path === path);

	test('is logged once it has been sent, with its time to headers beside', async () => {
		entries.length = 0;
		const response = await fetch(`${base}/slow`);
		expect(entryFor('/slow')).toBeUndefined();
		expect(await response.text()).toBe(
			'chunk 0\nchunk 1\nchunk 2\nchunk 3\nchunk 4\n',
		);
		await until(() => entryFor('/slow') !== undefined);
		const entry = entryFor('/slow');
		expect(entry).toMatchObject({
			level: 'info',
			status: 200,
			message: 'GET /slow 200',
			outcome: 'completed',
		});
		expect(entry?.duration).toBeGreaterThanOrEqual(190);
		expect(entry?.['timeToHeaders']).toBeLessThan(100);
		expect(entries.filter((each) => each.path === '/slow')).toHaveLength(1);
	});

	test('a client that leaves midway is logged as aborted, not a success', async () => {
		entries.length = 0;
		const abort = new AbortController();
		const response = await fetch(`${base}/slow`, { signal: abort.signal });
		const reader = response.body?.getReader();
		await reader?.read();
		abort.abort();
		await until(() => entryFor('/slow') !== undefined);
		const entry = entryFor('/slow');
		expect(entry).toMatchObject({
			level: 'warn',
			status: 200,
			message: 'GET /slow 200 aborted',
			outcome: 'aborted',
		});
		expect(entry?.duration).toBeLessThan(190);
	});

	test('a body that fails midway is logged as an error', async () => {
		entries.length = 0;
		const response = await fetch(`${base}/failing`);
		await response.text().catch(() => {});
		await until(() => entryFor('/failing') !== undefined);
		expect(entryFor('/failing')).toMatchObject({
			level: 'error',
			status: 200,
			message: 'GET /failing 200 errored',
			outcome: 'errored',
		});
	});

	test('an endless event stream is logged when its client leaves, and released', async () => {
		entries.length = 0;
		released.length = 0;
		const abort = new AbortController();
		const response = await fetch(`${base}/ticks`, { signal: abort.signal });
		const reader = response.body?.getReader();
		await reader?.read();
		await reader?.read();
		expect(entryFor('/ticks')).toBeUndefined();
		abort.abort();
		await until(() => entryFor('/ticks') !== undefined && released.length > 0);
		expect(entryFor('/ticks')).toMatchObject({ outcome: 'aborted' });
		expect(released).toEqual(['ticks']);
		await Bun.sleep(50);
		expect(entries.filter((each) => each.path === '/ticks')).toHaveLength(1);
	});
});

describe('a body that is not streamed', () => {
	const entries: LogEntry[] = [];
	const text = new Response('hello', {
		headers: { 'content-length': '5' },
	});
	const app = alxia()
		.use(logger({ write: (entry) => entries.push(entry) }))
		.get('/text', ({ reply }) => reply(200, 'hello'))
		.get('/empty', ({ reply }) => reply(204))
		.onRequest(({ url }) => (url.pathname === '/raw' ? text : undefined));

	test('is logged at once, its response untouched', async () => {
		entries.length = 0;
		await app.request('/text');
		await app.request('/empty');
		const raw = await app.request('/raw');
		expect(raw).toBe(text);
		expect(entries.map((entry) => entry.message)).toEqual([
			'GET /text 200',
			'GET /empty 204',
			'GET /raw 200',
		]);
		for (const entry of entries) {
			expect(entry).not.toHaveProperty('outcome');
			expect(entry).not.toHaveProperty('timeToHeaders');
		}
	});
});

describe('a streamed body without a server', () => {
	test('is logged once the test reads or cancels it', async () => {
		const entries: LogEntry[] = [];
		released.length = 0;
		const app = alxia()
			.use(logger({ write: (entry) => entries.push(entry) }))
			.get('/ticks', responds({ 200: Tick }), ({ reply }) =>
				reply(200, ticks()),
			)
			.get('/slow', ({ reply }) => reply(200, slow()));
		const ticking = await app.request('/ticks');
		expect(entries).toEqual([]);
		await ticking.body?.cancel();
		await Bun.sleep(0);
		expect(entries.at(-1)).toMatchObject({
			path: '/ticks',
			outcome: 'aborted',
		});
		await until(() => released.length > 0);
		expect(released).toEqual(['ticks']);
		await (await app.request('/slow')).text();
		expect(entries.at(-1)).toMatchObject({
			path: '/slow',
			outcome: 'completed',
		});
	});
});
