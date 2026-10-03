/**
 * The few lines between Vite's dev server, which speaks `node:http`, and an
 * alxia app, which speaks `Request` and `Response`: no dependency, Bun's
 * own `node:http` and `node:stream` underneath.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/** What Connect, Vite's middleware stack, adds to a request: the URL before any rewrite. */
type ConnectRequest = IncomingMessage & {
	readonly originalUrl?: string | undefined;
};

/** The `Request` a Node request stands for. Aborted when the client goes away. */
export function toRequest(req: ConnectRequest, res: ServerResponse): Request {
	const secure = (req.socket as { encrypted?: boolean }).encrypted === true;
	const url = new URL(
		req.originalUrl ?? req.url ?? '/',
		`${secure ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`,
	);
	const headers = new Headers();
	const raw = req.rawHeaders;
	for (let i = 0; i + 1 < raw.length; i += 2) {
		const name = raw[i] as string;
		// HTTP/2's pseudo-headers (`:path`, `:method`) are not headers.
		if (!name.startsWith(':')) headers.append(name, raw[i + 1] as string);
	}
	const controller = new AbortController();
	res.once('close', () => {
		if (!res.writableFinished) controller.abort();
	});
	const method = req.method ?? 'GET';
	const init: RequestInit & { duplex?: 'half' } = {
		method,
		headers,
		signal: controller.signal,
	};
	if (method !== 'GET' && method !== 'HEAD') {
		init.body = Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>;
		init.duplex = 'half';
	}
	return new Request(url, init);
}

/** Writes `response` to `res`, streaming its body chunk by chunk as it comes. */
export async function send(
	res: ServerResponse,
	response: Response,
): Promise<void> {
	res.statusCode = response.status;
	if (response.statusText !== '') res.statusMessage = response.statusText;
	for (const [name, value] of response.headers) {
		if (name !== 'set-cookie') res.setHeader(name, value);
	}
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) res.setHeader('set-cookie', cookies);
	if (response.body === null) {
		res.end();
		return;
	}
	res.flushHeaders();
	const reader = response.body.getReader();
	const cancel = () => void reader.cancel().catch(() => {});
	res.once('close', cancel);
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (res.destroyed) return;
			if (!res.write(value)) {
				await new Promise<void>((resolve) => {
					const go = () => {
						res.off('drain', go);
						res.off('close', go);
						resolve();
					};
					res.on('drain', go);
					res.on('close', go);
				});
			}
		}
		res.end();
	} finally {
		res.off('close', cancel);
	}
}
