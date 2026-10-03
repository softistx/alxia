import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import { createServer, type ViteDevServer } from 'vite';
import { BROWSER, copyFixture } from '../../test/fixture';

const browser = { 'user-agent': BROWSER };
const text = (html: string) => html.replaceAll('<!-- -->', '');

/** Vite's dev server on a copy of the fixture, in this process, on a free port. */
async function devServer(
	root: string,
	config: Parameters<typeof createServer>[0] = {},
) {
	const server = await createServer({
		root,
		configFile: join(root, 'vite.alxia.config.ts'),
		logLevel: 'silent',
		server: { port: 0, host: '127.0.0.1' },
		...config,
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address === null || typeof address !== 'object') {
		throw new Error('Vite did not listen');
	}
	return { server, base: `http://127.0.0.1:${address.port}` };
}

/** Polls `check` until it holds, or fails after `ms`. */
async function eventually(check: () => Promise<boolean>, ms = 5_000) {
	const until = performance.now() + ms;
	while (performance.now() < until) {
		if (await check()) return;
		await Bun.sleep(25);
	}
	throw new Error(`not within ${ms} ms`);
}

describe('react-router dev', () => {
	let fixture: Awaited<ReturnType<typeof copyFixture>>;
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

	test("a page is rendered by the entry, its loader reading alxiaOf and the app's own key", async () => {
		const response = await fetch(`${base}/`, {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		const html = text(await response.text());
		expect(html).toContain('<h1>Hello Ada</h1>');
		expect(html).toContain('<p id="route">/*</p>');
		// One module graph: the entry's getLoadContext sets the routes' own key.
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

	test('an entry whose default export is not an app is a 500 saying so', async () => {
		await Bun.write(
			join(fixture.root, 'app', 'not-an-app.ts'),
			'export default {};\n',
		);
		// React Router's plugin insists on a config file.
		const config = join(fixture.root, 'vite.not-an-app.config.ts');
		await Bun.write(
			config,
			(
				await Bun.file(join(fixture.root, 'vite.alxia.config.ts')).text()
			).replace('app/server.ts', 'app/not-an-app.ts'),
		);
		const other = await devServer(fixture.root, { configFile: config });
		try {
			const response = await fetch(`${other.base}/`, { headers: browser });
			expect(response.status).toBe(500);
			expect(await response.text()).toContain(
				'app/not-an-app.ts must export the alxia app as its default export',
			);
		} finally {
			await other.server.close();
		}
	});

	test('an ssr environment that runs elsewhere is a 500 saying so', async () => {
		const config = join(fixture.root, 'vite.elsewhere.config.ts');
		await Bun.write(
			config,
			(await Bun.file(join(fixture.root, 'vite.alxia.config.ts')).text())
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
});

describe('react-router build', () => {
	let fixture: Awaited<ReturnType<typeof copyFixture>>;

	beforeAll(async () => {
		fixture = await copyFixture();
		// Prerendering reads the server build back: it must still be one.
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, prerender: ['/login'] } satisfies Config;\n",
		);
		// A name a server build exports, exported by the entry: it stays the
		// entry's, out of the build.
		const entry = join(fixture.root, 'app', 'server.ts');
		await Bun.write(
			entry,
			`${await Bun.file(entry).text()}\nexport const routes = 'not a server build';\n`,
		);
		const result =
			await $`${process.execPath} --bun react-router build --config vite.alxia.config.ts`
				.cwd(fixture.root)
				// `bun test` sets NODE_ENV=test, which Vite would build as development.
				.env({ ...process.env, NODE_ENV: 'production' })
				.quiet()
				.nothrow();
		if (result.exitCode !== 0) {
			throw new Error(
				`react-router build failed:\n${result.stdout}\n${result.stderr}`,
			);
		}
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

	test('serve.js listens on PORT and HOST, and serves the pages, the API and the assets', async () => {
		const child = Bun.spawn(
			[process.execPath, join(fixture.root, 'build', 'server', 'serve.js')],
			{
				cwd: fixture.root,
				env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		try {
			const reader = child.stdout.getReader();
			let out = '';
			let url: string | undefined;
			while (url === undefined) {
				const { done, value } = await reader.read();
				if (done) throw new Error(`serve.js exited: ${out}`);
				out += new TextDecoder().decode(value);
				url = out.match(/alxia listening on (\S+)/)?.[1];
			}
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
