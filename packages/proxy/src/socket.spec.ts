import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { serve, until, upstream } from '../test/upstream';
import { BAD_GATEWAY_CLOSE, proxy } from './index';

interface Upgraded {
	readonly path: string;
	readonly headers: Record<string, string>;
}

/**
 * An upstream WebSocket server: it echoes each frame with its kind, says
 * `bye` by closing with 4001, and records the close the proxy sent it.
 */
function socketUpstream() {
	const state = {
		upgraded: [] as Upgraded[],
		closed: [] as [number, string][],
	};
	const up = upstream(
		(request, server) => {
			const url = new URL(request.url);
			const upgraded: Upgraded = {
				path: url.pathname + url.search,
				headers: Object.fromEntries(request.headers),
			};
			state.upgraded.push(upgraded);
			return server.upgrade(request, { data: upgraded })
				? (undefined as never)
				: new Response('upgrade expected', { status: 426 });
		},
		{
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
async function client(url: URL, path: string) {
	const socket = new WebSocket(new URL(path, url.href.replace('http', 'ws')));
	socket.binaryType = 'arraybuffer';
	const received: (string | number[])[] = [];
	const closed: { code?: number; reason?: string } = {};
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
		socket.addEventListener('open', resolve, { once: true });
		socket.addEventListener('close', resolve, { once: true });
	});
	return { socket, received, closed };
}

describe('proxy.ws', () => {
	test('relays text and binary frames both ways, sent before the upstream opened included', async () => {
		const { up, state } = socketUpstream();
		const url = serve(
			alxia().ws('/live/*', proxy.ws(up.url, { rewrite: '/live' })),
		);
		const { socket, received } = await client(url, '/live/room/1?token=t');
		socket.send('hello'); // may well arrive before the upstream is open
		socket.send(new Uint8Array([1, 2, 3]));
		await until(() => received.length === 2);
		expect(received).toEqual(['text:hello', [1, 2, 3, 255]]);
		expect(state.upgraded[0]?.path).toBe('/room/1?token=t');
		expect(state.upgraded[0]?.headers['x-forwarded-for']).toBe('127.0.0.1');
		socket.close();
	});

	test("a client's close reaches the upstream with its code and reason", async () => {
		const { up, state } = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received } = await client(url, '/live');
		socket.send('ping');
		await until(() => received.length === 1);
		socket.close(4000, 'client done');
		await until(() => state.closed.length === 1);
		expect(state.closed[0]).toEqual([4000, 'client done']);
	});

	test("the upstream's close reaches the client with its code and reason", async () => {
		const { up } = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, closed } = await client(url, '/live');
		socket.send('bye');
		await until(() => closed.code !== undefined);
		expect(closed).toEqual({ code: 4001, reason: 'upstream says bye' });
	});

	test('a shutdown closes both sides with 1001, going away', async () => {
		const { up, state } = socketUpstream();
		const app = alxia().ws('/live', proxy.ws(up.url));
		const url = serve(app);
		const { socket, received, closed } = await client(url, '/live');
		socket.send('ping');
		await until(() => received.length === 1);
		await app.stop();
		await until(() => state.closed.length === 1 && closed.code !== undefined);
		expect(closed.code).toBe(1001);
		expect(state.closed[0]?.[0]).toBe(1001);
	});

	test('an upstream that cannot be reached closes the client with 1014', async () => {
		const gone = Bun.serve({ port: 0, fetch: () => new Response() });
		const target = gone.url;
		gone.stop(true);
		const url = serve(alxia().ws('/live', proxy.ws(target)));
		const { closed } = await client(url, '/live');
		await until(() => closed.code !== undefined);
		expect(closed).toEqual({ code: BAD_GATEWAY_CLOSE, reason: 'bad gateway' });
	});

	test("the route's middlewares run before the upgrade", async () => {
		const { up, state } = socketUpstream();
		const app = alxia().ws(
			'/live',
			async (ctx, next) =>
				ctx.url.searchParams.get('token') === 'ok'
					? next()
					: ctx.reply(401, 'no'),
			proxy.ws(up.url, {
				headers: {
					request: { 'x-user': (ctx) => ctx.url.searchParams.get('token') },
				},
			}),
		);
		const refused = await app.request('/live', {
			headers: { upgrade: 'websocket', connection: 'upgrade' },
		});
		expect(refused.status).toBe(401);
		const url = serve(app);
		const { socket, received } = await client(url, '/live?token=ok');
		socket.send('x');
		await until(() => received.length === 1);
		expect(state.upgraded).toHaveLength(1);
		expect(state.upgraded[0]?.headers['x-user']).toBe('ok');
		socket.close();
	});

	test('refuses a target that is no ws, wss, http or https URL', () => {
		expect(() => proxy.ws('ftp://up.internal')).toThrow(
			'proxy.ws(): the target must be an absolute URL, ws://, wss://, http:// or https://; got "ftp://up.internal"',
		);
	});
});
