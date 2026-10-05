import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { floodUpstream, numbers, stallingUpstream } from '../test/flood';
import { client, socketUpstream } from '../test/sockets';
import { serve, until } from '../test/upstream';
import { OVERLOADED_CLOSE, proxy } from './index';

const KiB = 1024;
const MiB = 1024 * KiB;

/** `client`'s socket as Bun's, which pauses its reads. */
type Pausable = WebSocket & { pause(): boolean; resume(): boolean };

/** Resolves once `done()` holds, polling every 10 ms for `ms` at most. */
async function within(ms: number, done: () => boolean): Promise<void> {
	for (
		const end = performance.now() + ms;
		!done() && performance.now() < end;
	) {
		await Bun.sleep(10);
	}
}

describe('proxy.ws, with a client slower than the upstream', () => {
	test('a client that stops reading stops the upstream: what it gets to send stays bounded, and the relay stays open', async () => {
		const { up, state } = floodUpstream({
			frames: 1024,
			size: 64 * KiB,
			polite: true,
		});
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, closed } = await client(url, '/live');
		(socket as Pausable).pause();
		await Bun.sleep(500);
		// 64 MiB to flood; the socket buffers of both legs, the cap and a frame are all it may fill.
		expect(state.sent).toBeLessThan(12 * MiB);
		expect(closed.code).toBeUndefined();
		expect(state.closed).toEqual([]);
		socket.close();
	});

	test('the client reading again resumes the flow: every frame arrives, in order', async () => {
		const frames = 512;
		const { up, state } = floodUpstream({
			frames,
			size: 64 * KiB,
			polite: true,
		});
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received, closed } = await client(url, '/live');
		(socket as Pausable).pause();
		await Bun.sleep(300);
		const stalled = state.sent;
		expect(stalled).toBeLessThan(frames * 64 * KiB);
		(socket as Pausable).resume();
		await within(5_000, () => received.length === frames);
		expect(numbers(received)).toEqual(
			Array.from({ length: frames }, (_, i) => i),
		);
		expect(closed.code).toBeUndefined();
		socket.close();
	});

	test('past maxBuffered queued for a client that stopped reading, both sides close with 1013', async () => {
		// Without Bun's pause, the cap alone holds; with it, whether a frame
		// comes after the pause depends on how Bun's reads fall.
		const pause = (WebSocket.prototype as Pausable).pause;
		Object.defineProperty(WebSocket.prototype, 'pause', {
			value: undefined,
			configurable: true,
			writable: true,
		});
		const { up, state } = floodUpstream({
			frames: 256,
			size: 64 * KiB,
			from: 'message',
		});
		try {
			const url = serve(
				alxia().ws('/live', proxy.ws(up.url, { maxBuffered: 16 * KiB })),
			);
			const { socket, closed } = await client(url, '/live');
			pause.call(socket);
			socket.send('go');
			await within(2_000, () => state.closed.length === 1);
			expect(state.closed[0]).toEqual([OVERLOADED_CLOSE, 'client too slow']);
			(socket as Pausable).resume();
			await within(2_000, () => closed.code !== undefined);
			expect(closed).toEqual({
				code: OVERLOADED_CLOSE,
				reason: 'client too slow',
			});
		} finally {
			Object.defineProperty(WebSocket.prototype, 'pause', {
				value: pause,
				configurable: true,
				enumerable: true,
				writable: true,
			});
		}
	});
});

describe('proxy.ws, with an upstream slower than the client', () => {
	test('past maxBuffered queued for an upstream that stopped reading, both sides close with 1013', async () => {
		const stalling = await stallingUpstream();
		const url = serve(
			alxia().ws('/live', proxy.ws(stalling.url, { maxBuffered: 256 * KiB })),
		);
		const { socket, closed } = await client(url, '/live');
		stalling.stall();
		const frame = new Uint8Array(64 * KiB);
		const flood = setInterval(() => {
			if (socket.readyState !== WebSocket.OPEN) return;
			for (let i = 0; i < 16; i++) socket.send(frame);
		}, 5);
		try {
			await within(5_000, () => closed.code !== undefined);
		} finally {
			clearInterval(flood);
			stalling.resume();
		}
		expect(closed).toEqual({
			code: OVERLOADED_CLOSE,
			reason: 'upstream too slow',
		});
	});
});

describe('proxy.ws, at full speed', () => {
	test('a reading client and a reading upstream relay everything, the default cap untouched', async () => {
		const frames = 512;
		const { up } = floodUpstream({ frames, size: 64 * KiB, polite: true });
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received, closed } = await client(url, '/live');
		await within(5_000, () => received.length === frames);
		expect(numbers(received)).toEqual(
			Array.from({ length: frames }, (_, i) => i),
		);
		expect(closed.code).toBeUndefined();
		socket.close();
	});

	test('an echo both ways keeps every frame in order', async () => {
		const { up } = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received, closed } = await client(url, '/live');
		for (let i = 0; i < 200; i++) socket.send(`m${i}`);
		await until(() => received.length === 200);
		expect(received).toEqual(
			Array.from({ length: 200 }, (_, i) => `text:m${i}`),
		);
		expect(closed.code).toBeUndefined();
		socket.close();
	});

	test('maxBuffered must be a whole number of bytes above 0', () => {
		expect(() => proxy.ws('ws://up.test', { maxBuffered: 0 })).toThrow(
			'proxy.ws(): maxBuffered must be a whole number of bytes above 0; got 0',
		);
		expect(() => proxy.ws('ws://up.test', { maxBuffered: 1.5 })).toThrow(
			TypeError,
		);
	});
});
