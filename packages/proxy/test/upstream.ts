/**
 * Real upstreams for the specs: `Bun.serve` on a random port, each request
 * it received kept, and the app in front served the same way when a spec
 * needs a real connection (a client that aborts, a raw request line).
 */
import { afterEach } from 'bun:test';
import { connect } from 'node:net';
import type { AnyAlxia } from '@alxia/core';

/** What an upstream saw of one request. */
export interface Seen {
	readonly method: string;
	readonly url: URL;
	readonly headers: Headers;
	readonly body: string;
}

export interface Upstream {
	readonly url: URL;
	readonly seen: Seen[];
	readonly server: Bun.Server<unknown>;
}

const open: { stop(force?: boolean): unknown }[] = [];

afterEach(async () => {
	for (const server of open.splice(0)) await server.stop(true);
});

/**
 * An upstream answering with `answer`, by default an echo of what it
 * received as JSON: its method, path, query, headers and body.
 */
export function upstream(
	answer?: (
		request: Request,
		server: Bun.Server<unknown>,
	) => Response | Promise<Response>,
	websocket?: Bun.WebSocketHandler<unknown>,
): Upstream {
	const seen: Seen[] = [];
	const server = Bun.serve({
		port: 0,
		idleTimeout: 0,
		async fetch(request, server) {
			const url = new URL(request.url);
			if (answer !== undefined) return answer(request, server as never);
			const body = await request.text();
			seen.push({
				method: request.method,
				url,
				headers: request.headers,
				body,
			});
			return Response.json({
				method: request.method,
				path: url.pathname,
				search: url.search,
				headers: Object.fromEntries(request.headers),
				body,
			});
		},
		...(websocket === undefined ? {} : { websocket }),
	} as Bun.Serve.Options<unknown>) as Bun.Server<unknown>;
	open.push(server);
	return { url: server.url, seen, server };
}

/** `app` listening on a random port, stopped after the spec. */
export function serve(
	app: AnyAlxia,
	options: { shutdownTimeout?: number } = {},
): URL {
	const server = app.listen({
		port: 0,
		hostname: '127.0.0.1',
		signals: false,
		...options,
	});
	open.push({ stop: () => app.stop(true) });
	return server.url;
}

/** Sends `head` as a raw HTTP/1.1 request to `url`'s port and resolves to the status line and the body. */
export async function raw(url: URL, head: string): Promise<string> {
	const socket = connect(Number(url.port), '127.0.0.1');
	await new Promise((resolve) => socket.once('connect', resolve));
	const chunks: Buffer[] = [];
	socket.on('data', (chunk: Buffer) => chunks.push(chunk));
	socket.write(head);
	await new Promise((resolve) => {
		socket.once('end', resolve);
		socket.once('close', resolve);
		setTimeout(resolve, 1000);
	});
	socket.destroy();
	return Buffer.concat(chunks).toString();
}

/** Resolves once `done()` holds, polling every 5 ms for a second at most. */
export async function until(done: () => boolean): Promise<void> {
	for (let i = 0; i < 200 && !done(); i++) await Bun.sleep(5);
}
