import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createServer, type ViteDevServer } from 'vite';
import { BROWSER, copyFixture } from '../../test/fixture';

const browser = { 'user-agent': BROWSER };
const text = (html: string) => html.replaceAll('<!-- -->', '');

type Fixture = Awaited<ReturnType<typeof copyFixture>>;

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

/** A Vite config beside the fixture's, edited by `edit`. React Router's plugin insists on a file. */
async function configFile(
	root: string,
	name: string,
	edit: (source: string) => string,
): Promise<string> {
	const file = join(root, `vite.${name}.config.ts`);
	await Bun.write(
		file,
		edit(await Bun.file(join(root, 'vite.alxia.config.ts')).text()),
	);
	return file;
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

/** `react-router build` on a copy of the fixture, with the plugin. */
async function build(root: string): Promise<void> {
	const result =
		await $`${process.execPath} --bun react-router build --config vite.alxia.config.ts`
			.cwd(root)
			// `bun test` sets NODE_ENV=test, which Vite would build as development.
			.env({ ...process.env, NODE_ENV: 'production' })
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`react-router build failed:\n${result.stdout}\n${result.stderr}`,
		);
	}
}

/** `bun build/server/index.js` on a free port, once it printed `<who> listening on <url>`. */
async function start(root: string, who: string) {
	const child = Bun.spawn(
		[process.execPath, join(root, 'build', 'server', 'index.js')],
		{
			cwd: root,
			env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const reader = child.stdout.getReader();
	let out = '';
	const pattern = new RegExp(`${who} listening on (\\S+)`);
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			child.kill();
			throw new Error(`index.js exited: ${out}`);
		}
		out += new TextDecoder().decode(value);
		const url = out.match(pattern)?.[1];
		if (url !== undefined) {
			reader.releaseLock();
			return { child, url };
		}
	}
}

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

describe('react-router.config.ts the plugin does not serve', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	test('serverBundles is refused, saying so', async () => {
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, serverBundles: () => 'one' } satisfies Config;\n",
		);
		await expect(devServer(fixture.root)).rejects.toThrow(
			"serverBundles splits React Router's server build in several",
		);
	});

	test('a single-page app builds as it would without the plugin', async () => {
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: false } satisfies Config;\n",
		);
		// Server loaders have no place in a single-page app: one plain route.
		await Bun.write(
			join(fixture.root, 'app', 'routes.ts'),
			"import { index, type RouteConfig } from '@react-router/dev/routes';\n\nexport default [index('routes/plain.tsx')] satisfies RouteConfig;\n",
		);
		await Bun.write(
			join(fixture.root, 'app', 'routes', 'plain.tsx'),
			'export default function Plain() {\n\treturn <p>plain</p>;\n}\n',
		);
		await build(fixture.root);
		expect(
			await Bun.file(
				join(fixture.root, 'build', 'client', 'index.html'),
			).text(),
		).toContain('"isSpaMode":true');
	}, 60_000);
});

describe('react-router dev, with no server file', () => {
	let fixture: Fixture;
	let server: ViteDevServer;
	let base: string;

	beforeAll(async () => {
		fixture = await copyFixture({ server: false });
		// Before React Router's plugin this time: the order does not matter.
		const config = await configFile(fixture.root, 'first', (source) =>
			source.replace('[reactRouter(), alxia()]', '[alxia(), reactRouter()]'),
		);
		({ server, base } = await devServer(fixture.root, { configFile: config }));
	}, 30_000);
	afterAll(async () => {
		await server?.close();
		await fixture?.remove();
	});

	test('the default server renders the pages behind alxia, with BaseContext', async () => {
		const response = await fetch(`${base}/`, {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		const html = text(await response.text());
		// No hook derives `user`: the loader falls back.
		expect(html).toContain('<h1>Hello anonymous</h1>');
		expect(html).toContain('<p id="route">/*</p>');
		expect(html).toContain('virtual:react-router/inject-hmr-runtime');
	});

	test('a server file created while the dev server runs is used from the next request, and dropped when deleted', async () => {
		const file = join(fixture.root, 'app', 'server.ts');
		await Bun.write(
			file,
			"import { createServer } from '@alxia/react-router';\nimport { configure } from '../base';\nexport default createServer({ configure });\n",
		);
		try {
			const health = await fetch(`${base}/api/health`);
			expect(await health.json()).toEqual({ ok: true });
		} finally {
			await rm(file);
		}
		const after = await fetch(`${base}/api/health`, { headers: browser });
		// The default server has no `/api/health`: React Router's 404 page.
		expect(after.status).toBe(404);
		expect(after.headers.get('content-type')).toBe('text/html');
	});
});

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
