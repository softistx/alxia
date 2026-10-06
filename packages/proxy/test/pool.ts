/**
 * Upstreams that fail in a given way, for the specs of several upstreams:
 * a port nothing listens on (that can be listened on again), an upstream
 * that resets the connection once a request reached it, and one named, to
 * read which upstream answered.
 */
import { afterEach } from 'bun:test';
import { createServer, type Server } from 'node:net';
import { upstream } from './upstream';

const servers: Server[] = [];

afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

/** A port nothing listens on any more: one a server held, then gave back. */
export function closedPort(): URL {
	const server = Bun.serve({ port: 0, fetch: () => new Response() });
	const url = server.url;
	server.stop(true);
	return url;
}

/** An upstream answering its `name` and counting what it received. */
export function named(name: string, port = 0) {
	const state = { requests: 0, bodies: [] as string[] };
	const up = upstream(
		async (request) => {
			state.requests++;
			state.bodies.push(await request.text());
			return new Response(name);
		},
		undefined,
		port,
	);
	return { up, state };
}

/**
 * A TCP upstream that resets the connection once it received `bytes`
 * bytes of a request — its line and headers, part of its body — and counts
 * the connections it took.
 */
export async function resetter(bytes = 1) {
	const state = { connections: 0, received: 0 };
	const server = createServer((socket) => {
		state.connections++;
		let seen = 0;
		socket.on('data', (chunk: Buffer) => {
			seen += chunk.byteLength;
			state.received += chunk.byteLength;
			if (seen >= bytes) socket.resetAndDestroy();
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	return { url: new URL(`http://127.0.0.1:${port}/`), state };
}

/** A body sent `chunks` by `chunks`, `pause` ms apart. */
export function slowBody(
	chunks: readonly string[],
	pause = 50,
): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(new TextEncoder().encode(chunk));
				await Bun.sleep(pause);
			}
			controller.close();
		},
	});
}
