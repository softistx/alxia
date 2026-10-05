import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { createServer } from 'vite';
import { copyFixture } from '../../test/fixture';
import { open } from '../../test/socket';
import { devServer, eventually, type Fixture } from '../../test/vite';
import type { DevApp } from './dev';
import {
	closeAll,
	head,
	isProxied,
	isVites,
	type Sides,
	sideFor,
} from './socket';

describe('the relay, piece by piece', () => {
	test("Vite's own subprotocols are Vite's, in a list or alone", () => {
		const req = (protocol?: string) => ({
			headers:
				protocol === undefined ? {} : { 'sec-websocket-protocol': protocol },
		});
		expect(isVites(req('vite-hmr'))).toBe(true);
		expect(isVites(req('vite-ping'))).toBe(true);
		expect(isVites(req('chat, vite-hmr'))).toBe(true);
		expect(isVites(req('chat'))).toBe(false);
		expect(isVites(req())).toBe(false);
	});

	test("Vite's server.proxy keeps the upgrades it relays, matched as Vite matches them", () => {
		const proxy = {
			'/socket': { target: 'http://127.0.0.1:1', ws: true },
			'/ws-target': 'ws://127.0.0.1:1',
			'^/re/\\d+': { target: 'wss://127.0.0.1:1' },
			'/http-only': { target: 'http://127.0.0.1:1' },
		};
		expect(isProxied('/socket/room', proxy)).toBe(true);
		expect(isProxied('/ws-target', proxy)).toBe(true);
		expect(isProxied('/re/42', proxy)).toBe(true);
		expect(isProxied('/re/x', proxy)).toBe(false);
		expect(isProxied('/http-only', proxy)).toBe(false);
		expect(isProxied('/api/echo', proxy)).toBe(false);
		expect(isProxied('/api/echo', undefined)).toBe(false);
	});

	test('the request line and headers go to the side server as they came', () => {
		expect(
			head({
				method: 'GET',
				url: '/api/echo?x=1',
				rawHeaders: ['Host', 'a', 'X-User', 'Ada', 'X-User', 'Bo'],
			}),
		).toBe(
			'GET /api/echo?x=1 HTTP/1.1\r\nHost: a\r\nX-User: Ada\r\nX-User: Bo\r\n\r\n',
		);
	});

	test('one side server per app: a new app retires the old one, and closing stops them all', async () => {
		const app = (): DevApp => ({
			fetch: async () => new Response('side'),
			websocket: { message() {} } as DevApp['websocket'],
		});
		const sides: Sides = { current: undefined, retired: new Set() };
		const first = app();
		const one = sideFor(sides, first);
		expect(sideFor(sides, first)).toBe(one);
		const two = sideFor(sides, app());
		expect(two).not.toBe(one);
		// Retired: no new connection.
		await eventually(async () => {
			try {
				await fetch(one.url);
				return false;
			} catch {
				return true;
			}
		});
		expect(await (await fetch(two.url)).text()).toBe('side');
		closeAll(sides);
		expect(sides.current).toBeUndefined();
		await eventually(async () => {
			try {
				await fetch(two.url);
				return false;
			} catch {
				return true;
			}
		});
	});
});

describe("react-router dev, beside Vite's proxy and in middleware mode", () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	test("a socket Vite's server.proxy relays still reaches its target, beside the app's", async () => {
		const upstream = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			fetch: (request, bun) =>
				bun.upgrade(request, { data: undefined })
					? undefined
					: new Response('no', { status: 400 }),
			websocket: {
				open: (ws) => {
					ws.send(JSON.stringify({ from: 'upstream' }));
				},
				message: (ws, message) =>
					void ws.send(JSON.stringify({ echo: String(message) })),
			},
		});
		const { server, base } = await devServer(fixture.root, {
			server: {
				port: 0,
				host: '127.0.0.1',
				proxy: {
					'/up': { target: `ws://127.0.0.1:${upstream.port}`, ws: true },
				},
			},
		});
		try {
			const proxied = await open(base, '/up');
			expect(await proxied.next()).toEqual({ from: 'upstream' });
			// Only Vite's proxy wrote to the socket: it still carries frames.
			await Bun.sleep(200);
			proxied.socket.send('ping');
			expect(await proxied.next()).toEqual({ echo: 'ping' });
			expect(proxied.socket.readyState).toBe(WebSocket.OPEN);
			const app = await open(base, '/api/echo');
			expect(await app.next()).toEqual({ hello: 'anonymous' });
			proxied.socket.close();
			app.socket.close();
		} finally {
			await server.close();
			await upstream.stop(true);
		}
	}, 30_000);

	test('in middleware mode Vite has no HTTP server, and the plugin listens on none', async () => {
		const server = await createServer({
			root: fixture.root,
			configFile: join(fixture.root, 'vite.alxia.config.ts'),
			logLevel: 'silent',
			server: { middlewareMode: true },
		});
		try {
			expect(server.httpServer).toBeNull();
		} finally {
			await server.close();
		}
	}, 30_000);
});
