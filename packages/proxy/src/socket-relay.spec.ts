import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { client, socketUpstream } from '../test/sockets';
import { serve, until } from '../test/upstream';
import { proxy } from './index';

/** An upgrade request, a valid handshake, aborted by `controller`. */
function handshake(controller: AbortController): Request {
	return new Request('http://app.test/live', {
		signal: controller.signal,
		headers: {
			upgrade: 'websocket',
			connection: 'Upgrade',
			'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
			'sec-websocket-version': '13',
		},
	});
}

/** A server whose upgrade fails, as Bun's does for a client already gone, after `before`. */
function refusing(before: () => void = () => {}): Bun.Server<unknown> {
	return {
		upgrade: () => {
			before();
			return false;
		},
		requestIP: () => ({ address: '127.0.0.1', family: 'IPv4', port: 1 }),
	} as unknown as Bun.Server<unknown>;
}

describe('proxy.ws, between the upstream open and the client open', () => {
	test('an upstream that hangs up at once closes the client with its code', async () => {
		const { up } = socketUpstream({ greeting: ['hi'], hangUp: 4002 });
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { received, closed, opened } = await client(url, '/live');
		await until(() => closed.code !== undefined);
		expect(opened).toBe(true);
		expect(received).toEqual(['hi']);
		expect(closed).toEqual({ code: 4002, reason: 'hung up' });
	});

	test('past 1024 frames queued for a client not open yet, the upstream is closed with 1013', async () => {
		// Bun opens the client's socket within its upgrade, before the upstream
		// can send a frame: a server whose upgrade fails keeps the queue filling.
		const greeting = Array.from({ length: 1100 }, (_, i) => `f${i}`);
		const { up, state } = socketUpstream({ greeting });
		const app = alxia().ws('/live', proxy.ws(up.url, { timeout: 5_000 }));
		const response = await app.fetch(
			handshake(new AbortController()),
			refusing(),
		);
		expect(response.status).toBe(426);
		await until(() => state.closed.length === 1);
		expect(state.closed[0]).toEqual([1013, 'client not open yet']);
	});

	test('past maxBuffered bytes queued for a client not open yet, the upstream is closed with 1013', async () => {
		const greeting = Array.from({ length: 8 }, () => 'x'.repeat(4096));
		const { up, state } = socketUpstream({ greeting });
		const app = alxia().ws(
			'/live',
			proxy.ws(up.url, { timeout: 5_000, maxBuffered: 16 * 1024 }),
		);
		const response = await app.fetch(
			handshake(new AbortController()),
			refusing(),
		);
		expect(response.status).toBe(426);
		await until(() => state.closed.length === 1);
		expect(state.closed[0]).toEqual([1013, 'client not open yet']);
	});

	test('a client gone before its socket opens closes the upstream with 1001', async () => {
		const { up, state } = socketUpstream();
		const controller = new AbortController();
		const app = alxia().ws('/live', proxy.ws(up.url));
		const response = await app.fetch(
			handshake(controller),
			refusing(() => controller.abort()),
		);
		expect(response.status).toBe(426);
		await until(() => state.closed.length === 1);
		expect(state.closed[0]).toEqual([1001, 'client gone']);
	});

	test('an upgrade that fails with the client still there closes the upstream past timeout', async () => {
		const { up, state } = socketUpstream();
		const app = alxia().ws('/live', proxy.ws(up.url, { timeout: 100 }));
		const started = performance.now();
		const response = await app.fetch(
			handshake(new AbortController()),
			refusing(),
		);
		expect(response.status).toBe(426);
		await until(() => state.closed.length === 1);
		expect(state.closed[0]?.[0]).toBe(1001);
		expect(performance.now() - started).toBeGreaterThanOrEqual(100);
	});
});
