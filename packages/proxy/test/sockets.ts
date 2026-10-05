/**
 * WebSocket upstreams and clients for the socket specs: an upstream that
 * echoes each frame with its kind, and a client that collects what it
 * receives and how it closes.
 */
import { upstream } from './upstream';

export interface Upgraded {
	readonly path: string;
	readonly headers: Record<string, string>;
}

export interface SocketUpstreamOptions {
	/** The subprotocol the upstream picks among those offered, named in its `101`. */
	readonly choose?: (offered: readonly string[]) => string | undefined;
	/** Awaited before the upstream answers the upgrade: a slow upstream. */
	readonly before?: (request: Request) => Promise<void>;
	/** Sent the moment the upstream's socket opens, before the client's may have. */
	readonly greeting?: string;
}

/**
 * An upstream WebSocket server: it echoes each frame with its kind, says
 * `bye` by closing with 4001, and records the close the proxy sent it.
 */
export function socketUpstream(options: SocketUpstreamOptions = {}) {
	const state = {
		upgraded: [] as Upgraded[],
		closed: [] as [number, string][],
	};
	const up = upstream(
		async (request, server) => {
			const url = new URL(request.url);
			const upgraded: Upgraded = {
				path: url.pathname + url.search,
				headers: Object.fromEntries(request.headers),
			};
			state.upgraded.push(upgraded);
			await options.before?.(request);
			const offered = (request.headers.get('sec-websocket-protocol') ?? '')
				.split(',')
				.map((p) => p.trim())
				.filter((p) => p !== '');
			const chosen = options.choose?.(offered);
			const headers =
				chosen === undefined
					? {}
					: { headers: { 'sec-websocket-protocol': chosen } };
			return server.upgrade(request, { data: upgraded, ...headers })
				? (undefined as never)
				: new Response('upgrade expected', { status: 426 });
		},
		{
			open(ws) {
				if (options.greeting !== undefined) ws.send(options.greeting);
			},
			message(ws, message) {
				if (message === 'bye') ws.close(4001, 'upstream says bye');
				else if (typeof message === 'string') ws.send(`text:${message}`);
				else ws.send(new Uint8Array([...new Uint8Array(message), 255]));
			},
			close(_ws, code, reason) {
				state.closed.push([code, reason]);
			},
		},
	);
	return { up, state };
}

/** Opens a client socket on `url`, collecting what it receives and how it closes. */
export async function client(
	url: URL,
	path: string,
	protocols?: readonly string[],
) {
	const socket = new WebSocket(
		new URL(path, url.href.replace('http', 'ws')),
		protocols as string[] | undefined,
	);
	socket.binaryType = 'arraybuffer';
	const received: (string | number[])[] = [];
	const closed: { code?: number; reason?: string } = {};
	let opened = false;
	socket.addEventListener('message', (event) => {
		received.push(
			typeof event.data === 'string'
				? event.data
				: [...new Uint8Array(event.data)],
		);
	});
	socket.addEventListener('close', (event) => {
		closed.code = event.code;
		closed.reason = event.reason;
	});
	await new Promise((resolve) => {
		socket.addEventListener(
			'open',
			(event) => {
				opened = true;
				resolve(event);
			},
			{ once: true },
		);
		socket.addEventListener('close', resolve, { once: true });
	});
	return { socket, received, closed, opened };
}
