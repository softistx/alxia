/**
 * Upstreams for the backpressure specs, each a real `Bun.serve`: one that
 * floods the client, and one, in a worker, that stops reading on demand.
 */
import { afterEach } from 'bun:test';
import { upstream } from './upstream';

export interface FloodOptions {
	/** The frames sent, each `size` bytes, numbered in their first 4 bytes. */
	readonly frames: number;
	readonly size: number;
	/** Waits for Bun's `drain` after a -1, as a well-behaved upstream does; otherwise sends them all at once. */
	readonly polite?: boolean;
}

/**
 * An upstream that floods each socket from its open: `state.sent` is the
 * bytes Bun accepted from it, `state.closed` how the proxy closed it.
 */
export function floodUpstream(options: FloodOptions) {
	const state = { sent: 0, next: 0, closed: [] as [number, string][] };
	const frame = (i: number) => {
		const bytes = new Uint8Array(options.size);
		new DataView(bytes.buffer).setUint32(0, i);
		return bytes;
	};
	const pump = (ws: Bun.ServerWebSocket<unknown>) => {
		while (state.next < options.frames && ws.readyState === WebSocket.OPEN) {
			const sent = ws.send(frame(state.next));
			if (sent === 0) return;
			state.next++;
			state.sent += options.size;
			if (sent === -1 && options.polite === true) return;
		}
	};
	const up = upstream(
		(request, server) =>
			server.upgrade(request, { data: {} })
				? (undefined as never)
				: new Response('upgrade expected', { status: 426 }),
		{
			open: pump,
			drain: pump,
			message() {},
			close(_ws, code, reason) {
				state.closed.push([code, reason]);
			},
		},
	);
	return { up, state };
}

/** Reads the frame numbers `received` holds, in order: the 4 bytes each starts with. */
export function numbers(received: readonly (string | number[])[]): number[] {
	return received.map((frame) =>
		typeof frame === 'string'
			? -1
			: new DataView(new Uint8Array(frame.slice(0, 4)).buffer).getUint32(0),
	);
}

const workers: Worker[] = [];

afterEach(() => {
	for (const worker of workers.splice(0)) worker.terminate();
});

/**
 * An upstream `Bun.serve` in a worker, so it can stop reading: `stall()`
 * blocks the worker's thread, and its socket's reads with it, until
 * `resume()`; `received()` is the bytes it read.
 */
export async function stallingUpstream() {
	const shared = new Int32Array(new SharedArrayBuffer(8));
	const worker = new Worker(new URL('./stalling-worker.ts', import.meta.url));
	workers.push(worker);
	const url = await new Promise<URL>((resolve) => {
		worker.addEventListener(
			'message',
			(event) => resolve(new URL(event.data as string)),
			{ once: true },
		);
		worker.postMessage(shared);
	});
	return {
		url,
		stall: () => worker.postMessage('stall'),
		resume: () => {
			Atomics.store(shared, 0, 1);
			Atomics.notify(shared, 0);
		},
		received: () => Atomics.load(shared, 1),
	};
}
