/**
 * The worker behind `stallingUpstream`: a WebSocket `Bun.serve` counting
 * the bytes it reads into the shared array's second slot, which stops
 * reading — its whole thread blocked — on `stall`, until the first slot
 * is set.
 */
declare const self: Worker;

let shared: Int32Array | undefined;

self.addEventListener('message', (event) => {
	if (event.data === 'stall') {
		if (shared !== undefined) Atomics.wait(shared, 0, 0);
		return;
	}
	shared = event.data as Int32Array;
	const server = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		idleTimeout: 0,
		fetch: (request, server) =>
			server.upgrade(request)
				? undefined
				: new Response('upgrade expected', { status: 426 }),
		websocket: {
			message(_ws, message) {
				if (shared !== undefined) Atomics.add(shared, 1, message.length);
			},
		},
	});
	self.postMessage(server.url.href);
});
