import { connect } from 'node:net';

/** A socket to `path` on `base`, and its messages, read one at a time as JSON. */
export async function open(
	base: string,
	path: string,
	headers: Record<string, string> = {},
) {
	const url = new URL(path, base);
	url.protocol = 'ws:';
	// Bun's WebSocket takes headers; the DOM's type, which wins here, does not.
	const BunWebSocket = WebSocket as unknown as new (
		url: URL,
		options: Bun.WebSocketOptions,
	) => WebSocket;
	const socket = new BunWebSocket(url, { headers });
	const queue: unknown[] = [];
	const waiting: ((message: unknown) => void)[] = [];
	socket.onmessage = (event) => {
		const message = JSON.parse(String(event.data)) as unknown;
		const next = waiting.shift();
		if (next === undefined) queue.push(message);
		else next(message);
	};
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = reject;
	});
	socket.onerror = null;
	return {
		socket,
		next: (): Promise<unknown> =>
			queue.length > 0
				? Promise.resolve(queue.shift())
				: new Promise((resolve) => waiting.push(resolve)),
	};
}

/** A WebSocket handshake to `path` on `base`, by hand: the status line and body it got back. */
export function handshake(base: string, path: string): Promise<string> {
	const { hostname, port } = new URL(base);
	return new Promise((resolve, reject) => {
		const tcp = connect(Number(port), hostname, () => {
			tcp.write(
				`GET ${path} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
			);
		});
		let got = '';
		tcp.on('data', (chunk) => {
			got += String(chunk);
			if (got.includes('\r\n\r\n') && got.includes('}')) {
				tcp.destroy();
				resolve(got);
			}
		});
		tcp.on('error', reject);
		tcp.on('close', () => resolve(got));
	});
}
