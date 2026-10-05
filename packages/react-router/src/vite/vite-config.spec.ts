import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { browser, copyFixture, text } from '../../test/fixture';
import { build, configFile, devServer, type Fixture } from '../../test/vite';

describe('react-router.config.ts the plugin does not serve', () => {
	// A copy each: every test writes a config of its own.
	let fixture: Fixture;

	beforeEach(async () => {
		fixture = await copyFixture();
	});
	afterEach(async () => {
		await fixture?.remove();
	});

	test('serverBundles is refused, saying so', async () => {
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, serverBundles: () => 'one' } satisfies Config;\n",
		);
		// Through a build: a dev server refused at startup would leave React
		// Router's typegen watcher writing into the copy as it is removed.
		await expect(build(fixture.root)).rejects.toThrow(
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
		// Nothing derives `user`: the loader falls back.
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
