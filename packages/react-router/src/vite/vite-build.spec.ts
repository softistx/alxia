import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { browser, copyFixture, text } from '../../test/fixture';
import { build, type Fixture, start } from '../../test/vite';

describe('react-router build, with app/server.ts', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
		// Prerendering reads the server build back: it must still be one.
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, prerender: ['/login'] } satisfies Config;\n",
		);
		// A name a server build exports, exported by the server file: it stays
		// the file's, out of the build.
		const entry = join(fixture.root, 'app', 'server.ts');
		await Bun.write(
			entry,
			`${await Bun.file(entry).text()}\nexport const routes = 'not a server build';\n`,
		);
		await build(fixture.root);
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('the server build is the alxia app, and importing it listens on nothing', async () => {
		const module = (await import(
			join(fixture.root, 'build', 'server', 'index.js')
		)) as { default: { fetch: unknown; server: unknown }; routes: unknown };
		expect(module.default.fetch).toBeFunction();
		expect(module.default.server).toBeUndefined();
		// And React Router's server build, which its prerendering read.
		expect(Object.keys(module.routes as object)).toContain('routes/login');
		expect(
			await Bun.file(
				join(fixture.root, 'build', 'client', 'login', 'index.html'),
			).exists(),
		).toBe(true);
	});

	test('bun build/server/index.js listens on PORT and HOST, serves the pages, the API and the assets, and stops on SIGTERM', async () => {
		// The fixture's onListen prints its own line.
		const { child, url } = await start(fixture.root, 'fixture');
		try {
			expect(url).toStartWith('http://127.0.0.1:');
			const page = await fetch(url, {
				headers: { ...browser, 'x-user': 'Bo' },
			});
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(text(html)).toContain('<h1>Hello Bo</h1>');
			// Built with the app, app/context.ts is one module for both.
			expect(html).toContain('<p id="greeting">from the entry</p>');
			const health = await fetch(new URL('/api/health', url));
			expect(await health.json()).toEqual({ ok: true });
			const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
			expect(asset).toBeDefined();
			const served = await fetch(new URL(asset as string, url));
			expect(served.status).toBe(200);
			expect(served.headers.get('cache-control')).toBe(
				'public, max-age=31536000, immutable',
			);
			child.kill('SIGTERM');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});
});

describe('react-router build, with no server file', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture({ server: false });
		await build(fixture.root);
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('bun build/server/index.js serves the pages and the client build on the default server', async () => {
		const { child, url } = await start(fixture.root, 'alxia');
		try {
			const page = await fetch(url, { headers: browser });
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(text(html)).toContain('<h1>Hello anonymous</h1>');
			const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
			const served = await fetch(new URL(asset as string, url));
			expect(served.headers.get('cache-control')).toBe(
				'public, max-age=31536000, immutable',
			);
			const robots = await fetch(new URL('/robots.txt', url));
			expect(robots.headers.get('cache-control')).toBe('public, max-age=3600');
			child.kill('SIGTERM');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});
});
