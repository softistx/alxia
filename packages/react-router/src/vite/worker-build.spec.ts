import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { copyFixture } from '../../test/fixture';
import { build, configFile, type Fixture, start } from '../../test/vite';
import * as runtime from './runtime';

const WORKER = `import { defineWorkerContract } from '@alxia/react-router/pwa';
import { startWorker } from '@alxia/react-router/pwa/worker';

startWorker({ contract: defineWorkerContract({ cachePrefix: 'fixture' }) });
`;

const exists = (root: string, file: string) =>
	Bun.file(join(root, 'build', 'client', file)).exists();

/** A copy with the worker and the offline page the app would have. */
async function workerFixture(): Promise<Fixture> {
	const fixture = await copyFixture();
	await Bun.write(join(fixture.root, 'app', 'service-worker.ts'), WORKER);
	await Bun.write(
		join(fixture.root, 'public', 'offline.html'),
		'<h1>offline</h1>',
	);
	return fixture;
}

describe('react-router build, with app/service-worker.ts', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await workerFixture();
		await Bun.write(
			join(fixture.root, 'public', 'assets', 'body-latin-abcdefgh.woff2'),
			'font',
		);
		// The object form, through the plugin: precacheAssets reaches the build.
		const object = await configFile(fixture.root, 'object', (source) =>
			source.replace(
				'alxia()',
				'alxia({ worker: { precacheAssets: /^body-latin-[\\w-]{8}\\.woff2$/ } })',
			),
		);
		await build(fixture.root, object);
	}, 90_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('precacheAssets of the object form precaches the font', async () => {
		const code = await Bun.file(
			join(fixture.root, 'build', 'client', 'service-worker.js'),
		).text();
		expect(code).toContain('/assets/body-latin-abcdefgh.woff2');
	});

	test('writes build/client/service-worker.js, with the routes and the offline page precached', async () => {
		const code = await Bun.file(
			join(fixture.root, 'build', 'client', 'service-worker.js'),
		).text();
		expect(code).toContain('/offline.html');
		expect(code).toMatch(/\/assets\/entry\.client-[\w-]+\.js/);
	});

	test('the built server serves it as JavaScript', async () => {
		const { child, url } = await start(fixture.root, 'fixture');
		try {
			const response = await fetch(new URL('/service-worker.js', url));
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('javascript');
		} finally {
			child.kill();
			await child.exited;
		}
	});
});

describe('buildAppWorker, through alxia()', () => {
	test('names buildWorker() errors under the plugin, keeping the cause', async () => {
		const fixture = await workerFixture();
		try {
			const { buildAppWorker } = await import('./worker');
			const config = {
				root: fixture.root,
				__reactRouterPluginContext: {
					reactRouterConfig: {
						appDirectory: join(fixture.root, 'app'),
						buildDirectory: join(fixture.root, 'build'),
					},
				},
			} as unknown as ResolvedConfig;
			const error = await buildAppWorker(config, undefined).catch(
				(e: unknown) => e,
			);
			expect((error as Error).message).toStartWith(
				'alxia-react-router: buildWorker(): ',
			);
			expect(((error as Error).cause as Error).message).toStartWith(
				'buildWorker(): ',
			);
		} finally {
			await fixture.remove();
		}
	});
});

describe('react-router build, with no worker to build', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await workerFixture();
		const off = await configFile(fixture.root, 'off', (source) =>
			source.replace('alxia()', 'alxia({ worker: false })'),
		);
		await build(fixture.root, off);
	}, 90_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('worker: false builds none, though the file is there', async () => {
		expect(await exists(fixture.root, 'service-worker.js')).toBe(false);
	});

	test('without app/service-worker.ts there is none either', async () => {
		await Bun.file(join(fixture.root, 'app', 'service-worker.ts')).delete();
		await build(fixture.root);
		expect(await exists(fixture.root, 'service-worker.js')).toBe(false);
	}, 60_000);
});

describe('react-router build, with a worker that is not there', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	test('fails, saying which file is missing', async () => {
		const missing = await configFile(fixture.root, 'missing', (source) =>
			source.replace('alxia()', "alxia({ worker: 'sw/missing.ts' })"),
		);
		await expect(build(fixture.root, missing)).rejects.toThrow(
			'alxia-react-router: the worker sw/missing.ts does not exist. Create it, or leave worker out to build app/service-worker.ts when it exists.',
		);
	}, 60_000);
});

describe('react-router build, a single-page app with a named worker', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
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
		await Bun.write(join(fixture.root, 'sw', 'service-worker.ts'), WORKER);
		await Bun.write(
			join(fixture.root, 'public', 'offline.html'),
			'<h1>offline</h1>',
		);
		const named = await configFile(fixture.root, 'named', (source) =>
			source.replace('alxia()', "alxia({ worker: 'sw/service-worker.ts' })"),
		);
		await build(fixture.root, named);
	}, 90_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('ssr: false still builds build/client/service-worker.js, from the named file', async () => {
		expect(await exists(fixture.root, 'service-worker.js')).toBe(true);
	});
});

describe('buildAppWorker, on Node', () => {
	let buildAppWorker: typeof import('./worker').buildAppWorker;
	let dir: string;
	let real: typeof runtime;
	// Only what the worker reads: React Router's context, and the root.
	const config = () =>
		({
			root: dir,
			__reactRouterPluginContext: {
				reactRouterConfig: {
					appDirectory: join(dir, 'app'),
					buildDirectory: join(dir, 'build'),
				},
			},
		}) as unknown as ResolvedConfig;

	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), 'alxia-worker-'));
		// Bun's global is read-only: run requireBun as if on Node instead.
		const { requireBun } = runtime;
		real = { requireBun };
		mock.module('./runtime', () => ({
			requireBun: (
				command: string,
				hint?: string,
				_onBun?: boolean,
				reason?: string,
			) => requireBun(command, hint, false, reason),
		}));
		({ buildAppWorker } = await import('./worker'));
	});
	afterAll(async () => {
		// The mock outlives this file otherwise, for runtime.spec.ts.
		mock.module('./runtime', () => real);
		await rm(dir, { recursive: true, force: true });
	});

	test('with no worker file, returns before asking for Bun', async () => {
		await expect(buildAppWorker(config(), undefined)).resolves.toBeUndefined();
	});

	test("with a worker file, fails with requireBun's message", async () => {
		await Bun.write(join(dir, 'app', 'service-worker.ts'), WORKER);
		await expect(buildAppWorker(config(), undefined)).rejects.toThrow(
			'alxia-react-router: react-router build with a service worker is running on Node, and the worker is bundled by Bun.build.',
		);
	});
});
