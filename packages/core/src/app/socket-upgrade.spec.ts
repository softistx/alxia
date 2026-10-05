import { describe, expect, test } from 'bun:test';
import { HttpError } from '../errors/errors';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

/** The headers of an upgrade request, as a client sends them. */
const UPGRADE = {
	upgrade: 'websocket',
	connection: 'Upgrade',
	'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
	'sec-websocket-version': '13',
};

const who = defineMiddleware((_ctx, next) => next({ user: 'ada' }));

describe("a socket's upgrade handler", () => {
	test('is awaited after the middlewares, given what socket.data will be and the 101 headers', async () => {
		const seen: unknown[] = [];
		const app = alxia().ws('/', who, {
			async upgrade(data, headers) {
				await Bun.sleep(10);
				seen.push(data.user);
				(data as { ready?: boolean }).ready = true;
				headers.set('sec-websocket-protocol', 'b');
			},
			open: (socket) =>
				socket.send({ ready: (socket.data as { ready?: boolean }).ready }),
			message: () => {},
		});
		const server = app.listen({ port: 0 });
		try {
			const url = new URL('/', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url, ['a', 'b']);
			const received = await new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			expect(socket.protocol).toBe('b');
			socket.close();
			expect(received).toEqual({ ready: true });
			expect(seen).toEqual(['ada']);
		} finally {
			await server.stop(true);
		}
	});

	test('that throws answers the upgrade request in the error format, and opens nothing', async () => {
		const opened: string[] = [];
		const around: unknown[] = [];
		const app = alxia({ errors: 'problem' }).ws(
			'/',
			async (_ctx, next) => {
				try {
					return await next();
				} catch (error) {
					around.push((error as HttpError).status);
					throw error;
				}
			},
			{
				upgrade() {
					throw new HttpError(502, { error: 'bad_gateway' as const });
				},
				open: () => {
					opened.push('open');
				},
				message: () => {},
			},
		);
		const server = app.listen({ port: 0 });
		try {
			const response = await fetch(server.url, { headers: UPGRADE });
			expect(response.status).toBe(502);
			expect(response.headers.get('content-type')).toContain(
				'application/problem+json',
			);
			expect(opened).toEqual([]);
			expect(around).toEqual([502]);
		} finally {
			await server.stop(true);
		}
	});

	test('is not run without a server: the 426 comes first', async () => {
		const ran: string[] = [];
		const app = alxia().ws('/', {
			upgrade: () => {
				ran.push('upgrade');
			},
			message: () => {},
		});
		const response = await app.request('/', { headers: UPGRADE });
		expect(response.status).toBe(426);
		expect(ran).toEqual([]);
	});
});
