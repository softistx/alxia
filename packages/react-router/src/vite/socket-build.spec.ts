import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFixture } from '../../test/fixture';
import { handshake, open } from '../../test/socket';
import { build, type Fixture, previewServer, start } from '../../test/vite';

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
