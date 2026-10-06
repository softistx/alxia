import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browser, copyFixture, text } from '../../test/fixture';
import { open } from '../../test/socket';
import {
	build,
	devServer,
	type Fixture,
	previewServer,
	start,
} from '../../test/vite';

/**
 * `routes/live.tsx` on `base`: its loader's `alxiaOf(context).server`, and
 * whether its action's `server.publish` reaches a socket `/api/live` opened.
 */
async function live(base: string) {
	const page = await fetch(new URL('/live', base), { headers: browser });
	const serving = text(await page.text()).match(
		/<p id="serving">([^<]*)<\/p>/,
	)?.[1];
	const { socket, next } = await open(base, '/api/live');
	try {
		expect(await next()).toEqual({ subscribed: 'live' });
		const acted = await fetch(new URL('/live.data', base), {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ said: 'hello' }),
		});
		expect(acted.status).toBe(200);
		return { serving, received: await next() };
	} finally {
		socket.close();
	}
}

describe('alxiaOf(context).server under Vite and the built server', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	}, 30_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test("react-router dev: the side server the app's sockets are open on, so publish reaches them", async () => {
		const { server, base } = await devServer(fixture.root);
		try {
			const { serving, received } = await live(base);
			// Not Vite's own address: Vite's server is node:http, not a Bun.Server.
			expect(serving).toStartWith('http://127.0.0.1:');
			expect(serving).not.toBe(`${base}/`);
			expect(received).toEqual({ said: 'hello' });
		} finally {
			await server.close();
		}
	}, 30_000);

	test('bun build/server/index.js and vite preview: publish reaches the subscriber', async () => {
		await build(fixture.root);
		const { child, url } = await start(fixture.root, 'fixture');
		try {
			const { serving, received } = await live(url);
			expect(serving).toBe(url);
			expect(received).toEqual({ said: 'hello' });
		} finally {
			child.kill();
		}
		const { server, base } = await previewServer(fixture.root);
		try {
			expect((await live(base)).received).toEqual({ said: 'hello' });
		} finally {
			await server.close();
		}
	}, 60_000);
});
