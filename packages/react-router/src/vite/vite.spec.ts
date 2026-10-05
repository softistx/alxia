import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { browser, copyFixture, text } from '../../test/fixture';
import {
	configFile,
	devServer,
	eventually,
	type Fixture,
} from '../../test/vite';

describe('react-router dev, with app/server.ts', () => {
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

	test("a page is rendered by the server, its loader reading alxiaOf and the app's own key", async () => {
		const response = await fetch(`${base}/`, {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		const html = text(await response.text());
		expect(html).toContain('<h1>Hello Ada</h1>');
		expect(html).toContain('<p id="route">/*</p>');
		// One module graph: the server's getLoadContext sets the routes' own key.
		expect(html).toContain('<p id="greeting">from the entry</p>');
		// React Router's HMR runtime: the page is the dev server's.
		expect(html).toContain('virtual:react-router/inject-hmr-runtime');
	});

	test('an /api route answers beside the pages', async () => {
		const response = await fetch(`${base}/api/health`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	test('an action, its redirect and both cookies come back through Vite', async () => {
		const acted = await fetch(`${base}/?index`, {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '4' }),
		});
		expect(text(await acted.text())).toContain('<p id="added">added 4</p>');
		const redirected = await fetch(`${base}/login`, {
			method: 'POST',
			headers: browser,
			redirect: 'manual',
		});
		expect(redirected.status).toBe(302);
		expect(redirected.headers.getSetCookie()).toHaveLength(2);
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
		expect(first?.text).not.toContain('deferred-value');
		expect(all).toContain('deferred-value');
		expect(first?.at ?? Infinity).toBeLessThan(ended - 300);
	});

	test('a component edit reaches the browser over the HMR socket', async () => {
		const messages: string[] = [];
		const socket = new WebSocket(base.replace('http', 'ws'), ['vite-hmr']);
		socket.onmessage = (event) => messages.push(String(event.data));
		await new Promise((resolve, reject) => {
			socket.onopen = resolve;
			socket.onerror = reject;
		});
		const file = join(fixture.root, 'app', 'routes', 'home.tsx');
		const original = await Bun.file(file).text();
		try {
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
			const html = await (await fetch(`${base}/`, { headers: browser })).text();
			expect(text(html)).toContain('<h1>Howdy anonymous</h1>');
		} finally {
			socket.onerror = null;
			socket.close();
			await Bun.write(file, original);
		}
	});

	test("an edit to the server's own modules is live on the next request, with no restart", async () => {
		const file = join(fixture.root, 'base.ts');
		const original = await Bun.file(file).text();
		try {
			await Bun.write(
				file,
				original.replace(
					'reply.ok({ ok: true })',
					"reply.ok({ ok: 'edited' })",
				),
			);
			await eventually(async () => {
				const body = await (await fetch(`${base}/api/health`)).json();
				return (body as { ok: unknown }).ok === 'edited';
			});
		} finally {
			await Bun.write(file, original);
		}
	});

	test('a server file whose default export is not createServer() is a 500 saying so', async () => {
		await Bun.write(
			join(fixture.root, 'app', 'not-a-server.ts'),
			"import { alxia } from '@alxia/core';\nexport default alxia();\n",
		);
		const config = await configFile(fixture.root, 'not-a-server', (source) =>
			// An absolute entry, as a relative one is resolved to.
			source.replace(
				'alxia()]',
				`alxia({ entry: ${JSON.stringify(join(fixture.root, 'app', 'not-a-server.ts'))} })]`,
			),
		);
		const other = await devServer(fixture.root, { configFile: config });
		try {
			const response = await fetch(`${other.base}/`, { headers: browser });
			expect(response.status).toBe(500);
			expect(await response.text()).toContain(
				'app/not-a-server.ts must export createServer() from @alxia/react-router as its default export',
			);
		} finally {
			await other.server.close();
		}
	});

	test('an entry that does not exist is a 500 naming it', async () => {
		const config = await configFile(fixture.root, 'nowhere', (source) =>
			source.replace('alxia()]', "alxia({ entry: 'app/nowhere.ts' })]"),
		);
		const other = await devServer(fixture.root, { configFile: config });
		try {
			const response = await fetch(`${other.base}/`, { headers: browser });
			expect(response.status).toBe(500);
			expect(await response.text()).toContain(
				'the entry app/nowhere.ts does not exist',
			);
		} finally {
			await other.server.close();
		}
	});

	test('an ssr environment that runs elsewhere is a 500 saying so', async () => {
		const config = await configFile(fixture.root, 'elsewhere', (source) =>
			source
				.replace(
					"import { defineConfig } from 'vite';",
					"import { DevEnvironment, defineConfig } from 'vite';",
				)
				.replace(
					'plugins: [',
					// An environment with no module runner in this process, as a
					// worker runtime's would be.
					'environments: { ssr: { dev: { createEnvironment: (name, config) => new DevEnvironment(name, config, { hot: false }) } } },\n\tplugins: [',
				),
		);
		const other = await devServer(fixture.root, { configFile: config });
		try {
			const response = await fetch(`${other.base}/`, { headers: browser });
			expect(response.status).toBe(500);
			expect(await response.text()).toContain(
				"Vite's ssr environment does not run modules in this process",
			);
		} finally {
			await other.server.close();
		}
	});

	test("without React Router's plugin, Vite refuses to start, saying so", async () => {
		const config = await configFile(fixture.root, 'alone', (source) =>
			source.replace('plugins: [reactRouter(), alxia()]', 'plugins: [alxia()]'),
		);
		await expect(
			devServer(fixture.root, { configFile: config }),
		).rejects.toThrow("React Router's Vite plugin is not in this config");
	});
});
