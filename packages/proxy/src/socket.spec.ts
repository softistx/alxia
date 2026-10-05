import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { client, socketUpstream } from '../test/sockets';
import { serve, until } from '../test/upstream';
import { proxy } from './index';

describe('proxy.ws', () => {
	test('relays text and binary frames both ways, sent the moment the client opens included', async () => {
		const { up, state } = socketUpstream();
		const url = serve(
			alxia().ws('/live/*', proxy.ws(up.url, { rewrite: '/live' })),
		);
		const { socket, received } = await client(url, '/live/room/1?token=t');
		socket.send('hello');
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
