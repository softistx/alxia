import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { alxia, eventStream } from '@alxia/core';
import {
	createTelemetry,
	type Exporter,
	type Signal,
	type SpanRecord,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { z } from 'zod';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

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

describe('the span of a streamed body', () => {
	const signals: Signal[] = [];
	const exporter: Exporter = {
		export(_resource, batch) {
			signals.push(...batch);
		},
	};
	const instance = createTelemetry('alxia-test', {
		exporters: [exporter],
		batch: 1,
	});
	const app = alxia()
		.use(telemetry({ instance }))
		.get('/slow', ({ reply }) => reply(200, slow()))
		.get('/failing', ({ reply }) => reply(200, failing()))
		.get('/ticks', { response: { 200: Tick } }, ({ reply }) =>
			reply(200, ticks()),
		)
		.get('/text', ({ reply }) => reply(200, 'hello'));
	const server = app.listen({ port: 0 });
	const base = `http://127.0.0.1:${server.port}`;
	afterAll(() => server.stop(true));

	const spanOf = (name: string) =>
		signals.find(
			(signal): signal is SpanRecord =>
				signal.type === 'span' && signal.name === name,
		);

	test('ends once the body has been sent', async () => {
		signals.length = 0;
		const response = await fetch(`${base}/slow`);
		expect(spanOf('GET /slow')).toBeUndefined();
		await response.text();
		await until(() => spanOf('GET /slow') !== undefined);
		const span = spanOf('GET /slow');
		expect(span?.status).toBe('ok');
		expect(span?.events).toEqual([]);
		expect(
			(span?.endedAt ?? 0) - (span?.startedAt ?? 0),
		).toBeGreaterThanOrEqual(190);
	});

	test('a client that leaves midway adds an event, and is no error', async () => {
		signals.length = 0;
		const abort = new AbortController();
		const response = await fetch(`${base}/slow`, { signal: abort.signal });
		await response.body?.getReader().read();
		abort.abort();
		await until(() => spanOf('GET /slow') !== undefined);
		const span = spanOf('GET /slow');
		expect(span?.status).toBe('ok');
		expect(span?.events.map((event) => event.name)).toEqual([
			'http.response.aborted',
		]);
	});

	test('a body that fails midway fails the span', async () => {
		signals.length = 0;
		const response = await fetch(`${base}/failing`);
		await response.text().catch(() => {});
		await until(() => spanOf('GET /failing') !== undefined);
		const span = spanOf('GET /failing');
		expect(span?.status).toBe('error');
		expect(span?.error?.message).toBe('renderer crashed');
	});

	test('an endless event stream ends its span when its client leaves', async () => {
		signals.length = 0;
		released.length = 0;
		const abort = new AbortController();
		const response = await fetch(`${base}/ticks`, { signal: abort.signal });
		const reader = response.body?.getReader();
		await reader?.read();
		await reader?.read();
		expect(spanOf('GET /ticks')).toBeUndefined();
		abort.abort();
		await until(
			() => spanOf('GET /ticks') !== undefined && released.length > 0,
		);
		expect(spanOf('GET /ticks')?.events.map((event) => event.name)).toEqual([
			'http.response.aborted',
		]);
		expect(released).toEqual(['ticks']);
	});

	test('a body of known length ends the span with the response', async () => {
		signals.length = 0;
		const response = await fetch(`${base}/text`);
		await until(() => spanOf('GET /text') !== undefined);
		expect(spanOf('GET /text')).toBeDefined();
		expect(await response.text()).toBe('hello');
	});
});
