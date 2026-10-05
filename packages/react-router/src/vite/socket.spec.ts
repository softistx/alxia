import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { copyFixture } from '../../test/fixture';
import { handshake, open } from '../../test/socket';
import { devServer, eventually, type Fixture } from '../../test/vite';

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

	test("a ws route opens through Vite's server, echoes, and reads what the middlewares derived", async () => {
		const { socket, next } = await open(base, '/api/echo', { 'x-user': 'Ada' });
		try {
			expect(await next()).toEqual({ hello: 'Ada' });
			socket.send('ping');
			expect(await next()).toEqual({ echo: 'ping' });
		} finally {
			socket.close();
		}
	});

	test('an upgrade a middleware refuses gets its status and body, and never becomes a socket', async () => {
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
