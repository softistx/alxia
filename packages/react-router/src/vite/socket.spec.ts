import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connect } from 'node:net';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { copyFixture } from '../../test/fixture';
import {
	build,
	devServer,
	eventually,
	type Fixture,
	previewServer,
	start,
} from '../../test/vite';
import type { DevApp } from './dev';
import {
	closeAll,
	head,
	isProxied,
	isVites,
	type Sides,
	sideFor,
} from './socket';

/** A socket to `path` on `base`, and its messages, read one at a time as JSON. */
async function open(
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
function handshake(base: string, path: string): Promise<string> {
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

describe('react-router dev, WebSocket routes', () => {
	let fixture: Fixture;
	let server: ViteDevServer;
	let base: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		({ server, base } = await devServer(fixture.root));
	}, 30_000);
	afterAll(async () => {
		await server?.close();
		await fixture?.remove();
	});

	test("a ws route opens through Vite's server, echoes, and reads what the hooks derived", async () => {
		const { socket, next } = await open(base, '/api/echo', { 'x-user': 'Ada' });
		try {
			expect(await next()).toEqual({ hello: 'Ada' });
			socket.send('ping');
			expect(await next()).toEqual({ echo: 'ping' });
		} finally {
			socket.close();
		}
	});

	test('an upgrade a hook refuses gets its status and body, and never becomes a socket', async () => {
		const refused = await handshake(base, '/api/private');
		expect(refused).toStartWith('HTTP/1.1 401');
		expect(refused).toContain('{"error":"unauthenticated"}');
		const { socket, next } = await open(base, '/api/private', {
			'x-user': 'Bo',
		});
		try {
			expect(await next()).toEqual({ hello: 'Bo' });
		} finally {
			socket.close();
		}
	});

	test("Vite's HMR socket is left to Vite, and still delivers a js-update", async () => {
		const app = await open(base, '/api/echo');
		const messages: string[] = [];
		const hmr = new WebSocket(base.replace('http', 'ws'), ['vite-hmr']);
		hmr.onmessage = (event) => messages.push(String(event.data));
		await new Promise((resolve, reject) => {
			hmr.onopen = resolve;
			hmr.onerror = reject;
		});
		const file = join(fixture.root, 'app', 'routes', 'home.tsx');
		const original = await Bun.file(file).text();
		try {
			expect(hmr.protocol).toBe('vite-hmr');
			// As the browser would: the module is loaded before it is watched.
			await fetch(`${base}/app/routes/home.tsx`);
			await Bun.write(file, original.replace('<h1>Hello', '<h1>Howdy'));
			await eventually(async () =>
				messages.some((message) => {
					const payload = JSON.parse(message) as {
						type: string;
						updates?: { type: string; path: string }[];
					};
					return (
						payload.type === 'update' &&
						payload.updates?.some(
							(update) =>
								update.type === 'js-update' &&
								update.path === '/app/routes/home.tsx',
						) === true
					);
				}),
			);
			// The app's socket, open beside it all along.
			expect(await app.next()).toEqual({ hello: 'anonymous' });
			app.socket.send('still here');
			expect(await app.next()).toEqual({ echo: 'still here' });
		} finally {
			hmr.onerror = null;
			hmr.close();
			app.socket.close();
			await Bun.write(file, original);
		}
	});

	test('a server that fails to load is a 500 to the handshake, and the next connection loads it again', async () => {
		const file = join(fixture.root, 'app', 'server.ts');
		const original = await Bun.file(file).text();
		try {
			await Bun.write(file, `throw new Error('broken');\n${original}`);
			await eventually(
				async () =>
					(await handshake(base, '/api/echo')).startsWith('HTTP/1.1 500'),
				15_000,
			);
			// Two writes within chokidar's atomic window (100 ms) are one change
			// on Linux: the restore would go unseen, by pages and sockets alike.
			await Bun.sleep(300);
		} finally {
			await Bun.write(file, original);
		}
		await eventually(async () => {
			try {
				const { socket, next } = await open(base, '/api/echo');
				const message = await next();
				socket.close();
				return JSON.stringify(message) === '{"hello":"anonymous"}';
			} catch {
				return false;
			}
		}, 15_000);
	}, 40_000);

	test('an edit to the server file is used by the next connection, the open ones kept on the handlers they opened with', async () => {
		const before = await open(base, '/api/echo');
		expect(await before.next()).toEqual({ hello: 'anonymous' });
		const file = join(fixture.root, 'app', 'server.ts');
		const original = await Bun.file(file).text();
		// Clear of the last test's write to the same file: see above.
		await Bun.sleep(300);
		try {
			await Bun.write(
				file,
				original.replace(
					'\tconfigure,',
					"\tconfigure: (app) =>\n\t\tconfigure(app).ws('/api/added', {}, {\n\t\t\topen: (socket) => socket.send({ added: true }),\n\t\t\tmessage: () => {},\n\t\t}),",
				),
			);
			await eventually(async () => {
				try {
					const added = await open(base, '/api/added');
					const message = await added.next();
					added.socket.close();
					return JSON.stringify(message) === '{"added":true}';
				} catch {
					return false;
				}
			}, 15_000);
			before.socket.send('old');
			expect(await before.next()).toEqual({ echo: 'old' });
		} finally {
			before.socket.close();
			await Bun.write(file, original);
		}
	}, 25_000);
});

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

describe('react-router build and vite preview, WebSocket routes', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
		await build(fixture.root);
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('bun build/server/index.js opens the same routes, refused alike', async () => {
		const { child, url } = await start(fixture.root, 'fixture');
		try {
			const { socket, next } = await open(url, '/api/echo', {
				'x-user': 'Ada',
			});
			expect(await next()).toEqual({ hello: 'Ada' });
			socket.send('ping');
			expect(await next()).toEqual({ echo: 'ping' });
			socket.close();
			const refused = await handshake(url, '/api/private');
			expect(refused).toStartWith('HTTP/1.1 401');
			expect(refused).toContain('{"error":"unauthenticated"}');
		} finally {
			child.kill();
		}
	});

	test('vite preview relays them to the built server, refused alike', async () => {
		const { server, base } = await previewServer(fixture.root);
		try {
			const { socket, next } = await open(base, '/api/echo', {
				'x-user': 'Ada',
			});
			expect(await next()).toEqual({ hello: 'Ada' });
			socket.send('ping');
			expect(await next()).toEqual({ echo: 'ping' });
			socket.close();
			const refused = await handshake(base, '/api/private');
			expect(refused).toStartWith('HTTP/1.1 401');
			expect(refused).toContain('{"error":"unauthenticated"}');
		} finally {
			await server.close();
		}
	}, 30_000);
});
