import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PreviewServer } from 'vite';
import { browser, copyFixture } from '../../test/fixture';
import { build, type Fixture, previewServer } from '../../test/vite';

describe('vite preview, after react-router build', () => {
	let fixture: Fixture;
	let server: PreviewServer;
	let base: string;
	beforeAll(async () => {
		fixture = await copyFixture();
		await build(fixture.root);
		({ server, base } = await previewServer(fixture.root));
	}, 60_000);
	afterAll(async () => {
		await server?.close();
		await fixture?.remove();
	});

	test("a page is the built server's: its middlewares, alxiaOf and the app's own key", async () => {
		const response = await fetch(`${base}/`, {
			headers: { ...browser, 'x-user': 'Bo' },
		});
		expect(response.status).toBe(200);
		const html = (await response.text()).replaceAll('<!-- -->', '');
		expect(html).toContain('<h1>Hello Bo</h1>');
		expect(html).toContain('<p id="greeting">from the entry</p>');
		// Built, not served by Vite's dev server: no HMR runtime.
		expect(html).not.toContain('virtual:react-router/inject-hmr-runtime');
	});

	test('an /api route answers beside the pages', async () => {
		const response = await fetch(`${base}/api/health`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	test("an asset is the app's, with its cache headers, not Vite's", async () => {
		const html = await (await fetch(`${base}/`, { headers: browser })).text();
		const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
		expect(asset).toBeDefined();
		const served = await fetch(`${base}${asset}`);
		expect(served.status).toBe(200);
		expect(served.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);
		const robots = await fetch(`${base}/robots.txt`);
		expect(robots.headers.get('cache-control')).toBe('public, max-age=3600');
	});

	test('the page still streams', async () => {
		const started = performance.now();
		const response = await fetch(`${base}/slow`, {
			headers: { ...browser, 'accept-encoding': 'identity' },
		});
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const decoder = new TextDecoder();
		let first: { at: number; text: string } | undefined;
		let all = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = decoder.decode(value, { stream: true });
			first ??= { at: performance.now() - started, text: chunk };
			all += chunk;
		}
		const ended = performance.now() - started;
		expect(first?.text).toContain('id="fallback"');
		expect(all).toContain('deferred-value');
		expect(first?.at ?? Infinity).toBeLessThan(ended - 300);
	});

	test('an action gets its body, and a redirect both its cookies', async () => {
		const acted = await fetch(`${base}/?index`, {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '4' }),
		});
		expect((await acted.text()).replaceAll('<!-- -->', '')).toContain(
			'<p id="added">added 4</p>',
		);
		const redirected = await fetch(`${base}/login`, {
			method: 'POST',
			headers: browser,
			redirect: 'manual',
		});
		expect(redirected.status).toBe(302);
		expect(redirected.headers.getSetCookie()).toHaveLength(2);
	});
});

describe("React Router's prerendering, which runs on the preview server", () => {
	let fixture: Fixture;
	beforeAll(async () => {
		fixture = await copyFixture();
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, prerender: ['/'] } satisfies Config;\n",
		);
		await build(fixture.root);
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test("a prerendered page went through the built server: its loader read alxiaOf and the app's own key", async () => {
		const html = (
			await Bun.file(join(fixture.root, 'build', 'client', 'index.html')).text()
		).replaceAll('<!-- -->', '');
		expect(html).toContain('<h1>Hello anonymous</h1>');
		expect(html).toContain('<p id="greeting">from the entry</p>');
	});
});

describe('vite preview, with no alxia server built', () => {
	// A copy each: a module once imported stays loaded in this process.
	let fixture: Fixture;
	beforeEach(async () => {
		fixture = await copyFixture();
		// Vite's preview wants the client folder; nothing else is built.
		await mkdir(join(fixture.root, 'build', 'client'), { recursive: true });
	});
	afterEach(async () => {
		await fixture?.remove();
	});

	test('a missing build/server/index.js is a 500 saying to build first, and the next request after the build loads it', async () => {
		const { server, base } = await previewServer(fixture.root);
		const file = join(fixture.root, 'build', 'server', 'index.js');
		try {
			const response = await fetch(`${base}/`);
			expect(response.status).toBe(500);
			expect(await response.text()).toBe(
				'alxia-react-router: build/server/index.js does not exist. Run react-router build before vite preview.',
			);
			await Bun.write(
				file,
				"export default { fetch: () => new Response('built') };\n",
			);
			expect(await (await fetch(`${base}/`)).text()).toBe('built');
		} finally {
			await server.close();
		}
	});

	test("a build made without the plugin is a 500 saying it is not alxia's server", async () => {
		// What React Router builds alone: its exports, and no default app.
		await Bun.write(
			join(fixture.root, 'build', 'server', 'index.js'),
			'export const routes = {};\n',
		);
		const { server, base } = await previewServer(fixture.root);
		try {
			const response = await fetch(`${base}/`);
			expect(response.status).toBe(500);
			expect(await response.text()).toBe(
				"alxia-react-router: build/server/index.js is not alxia's server: its default export has no fetch. Build it with alxia() in vite.config.ts's plugins, then run vite preview again.",
			);
		} finally {
			await server.close();
		}
	});
});
