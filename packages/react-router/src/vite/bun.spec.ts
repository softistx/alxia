import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveConfig, type ViteDevServer } from 'vite';
import { copyFixture } from '../../test/fixture';
import {
	build,
	configFile,
	devServer,
	type Fixture,
	start,
} from '../../test/vite';
import { bunEnvironment } from './bun';

describe('bunEnvironment', () => {
	const conditions = ['module', 'node', 'production'];

	test('adds bun to the conditions and the external conditions, after what is there', () => {
		const added = bunEnvironment({
			resolve: { conditions, externalConditions: ['node'] },
		});
		expect(added.resolve?.conditions).toEqual(['bun']);
		expect(added.resolve?.externalConditions).toEqual(['bun']);
	});

	test('adds nothing an app already set', () => {
		const added = bunEnvironment({
			resolve: {
				conditions: ['bun', ...conditions],
				externalConditions: ['bun'],
				builtins: ['bun', /^bun:/],
			},
			build: { target: 'es2022' },
		});
		expect(added).toEqual({
			resolve: { conditions: [], externalConditions: [], builtins: [] },
		});
	});

	test("unset, Vite's defaults come along, since setting a value replaces them", () => {
		const added = bunEnvironment({});
		expect(added.resolve?.conditions).toEqual([
			'module',
			'node',
			'development|production',
			'bun',
		]);
		expect(added.resolve?.externalConditions).toEqual([
			'node',
			'module-sync',
			'bun',
		]);
		const builtins = added.resolve?.builtins ?? [];
		expect(builtins).toContain('fs');
		expect(builtins.map(String)).toContain(String(/^node:/));
		expect(builtins.map(String)).toContain(String(/^bun:/));
		// Bare `bun`, which Node's own list lacks.
		expect(builtins.filter((item) => item === 'bun')).toHaveLength(1);
	});

	test("an app's own builtins are kept, and only bun and bun:* added", () => {
		const added = bunEnvironment({ resolve: { builtins: ['fs', /^node:/] } });
		expect(added.resolve?.builtins?.map(String)).toEqual([
			'bun',
			String(/^bun:/),
		]);
	});

	test('targets esnext, unless a target is set', () => {
		expect(bunEnvironment({}).build).toEqual({ target: 'esnext' });
		expect(bunEnvironment({ build: { target: 'node22' } }).build).toBe(
			undefined,
		);
	});
});

describe('the ssr environment, as Vite resolves it with the plugin', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	const ssrOf = async (command: 'build' | 'serve', configFile?: string) => {
		const config = await resolveConfig(
			{
				root: fixture.root,
				configFile: configFile ?? join(fixture.root, 'vite.alxia.config.ts'),
				logLevel: 'silent',
			},
			command,
			'production',
		);
		const ssr = config.environments['ssr'];
		if (ssr === undefined) throw new Error('no ssr environment');
		return ssr;
	};

	test("react-router build: bun beside React Router's conditions, bun and bun:* builtins, esnext", async () => {
		const ssr = await ssrOf('build');
		expect(ssr.resolve.conditions).toContain('bun');
		// React Router's own, kept.
		expect(ssr.resolve.conditions).toContain('node');
		expect(ssr.resolve.externalConditions).toContain('bun');
		expect(ssr.resolve.externalConditions).toContain('node');
		expect(ssr.resolve.builtins).toContain('bun');
		expect(ssr.resolve.builtins).toContain('fs');
		expect(ssr.resolve.builtins.map(String)).toContain(String(/^bun:/));
		expect(ssr.build.target).toBe('esnext');
		// Bun runs Node's modules: the server build stays a Node-like one.
		expect(ssr.consumer).toBe('server');
	});

	test('react-router dev: the same conditions for the modules the SSR runner loads', async () => {
		const ssr = await ssrOf('serve');
		expect(ssr.resolve.conditions).toContain('bun');
		expect(ssr.resolve.conditions).toContain('development');
		expect(ssr.resolve.externalConditions).toContain('bun');
		expect(ssr.resolve.builtins).toContain('bun');
	});

	test("the app's own conditions and target win, at either level", async () => {
		const top = await configFile(fixture.root, 'own-top', (source) =>
			source
				.replace(
					"ssr: { external: ['@alxia/react-router', '@alxia/core'] }",
					"ssr: { external: ['@alxia/react-router', '@alxia/core'], resolve: { conditions: ['worker'], externalConditions: ['worker'] } }",
				)
				.replace('plugins: [', "build: { target: 'es2022' },\n\tplugins: ["),
		);
		const fromTop = await ssrOf('build', top);
		expect(fromTop.resolve.conditions).toContain('worker');
		expect(fromTop.resolve.conditions).toContain('bun');
		expect(fromTop.resolve.externalConditions).toContain('worker');
		expect(fromTop.build.target).toBe('es2022');

		const own = await configFile(fixture.root, 'own-env', (source) =>
			source.replace(
				'plugins: [',
				"environments: { ssr: { build: { target: 'node22' }, resolve: { conditions: ['bun', 'worker'] } } },\n\tplugins: [",
			),
		);
		const fromEnvironment = await ssrOf('build', own);
		expect(fromEnvironment.build.target).toBe('node22');
		expect(
			fromEnvironment.resolve.conditions.filter((c) => c === 'bun'),
		).toHaveLength(1);
		expect(fromEnvironment.resolve.conditions).toContain('worker');
	});
});

/**
 * Two packages that export a `bun` variant before their default one, as a
 * package written for Bun does: one bundled into the server build, one
 * left external, as dependencies are by default.
 */
async function addBunPackages(root: string) {
	for (const name of ['bun-inlined', 'bun-external']) {
		const dir = join(root, 'node_modules', name);
		await mkdir(dir, { recursive: true });
		await Bun.write(
			join(dir, 'package.json'),
			JSON.stringify({
				name,
				type: 'module',
				exports: { bun: './bun.js', default: './node.js' },
			}),
		);
		await Bun.write(
			join(dir, 'bun.js'),
			`export const variant = '${name}:bun-variant';\n`,
		);
		await Bun.write(
			join(dir, 'node.js'),
			`export const variant = '${name}:node-variant';\n`,
		);
	}
	// A server importing both, and Bun's own modules.
	await Bun.write(
		join(root, 'app', 'server.ts'),
		`import { createServer } from '@alxia/react-router';
import { file } from 'bun';
import { Database } from 'bun:sqlite';
import { variant as external } from 'bun-external';
import { variant as inlined } from 'bun-inlined';

export default createServer({
	configure: (app) =>
		app.get('/api/bun', async ({ reply }) => {
			const db = new Database(':memory:');
			const row = db.query('select 1 + 1 as two').get() as { two: number };
			db.close();
			return reply.ok({
				inlined,
				external,
				two: row.two,
				exists: await file('no-such-file').exists(),
			});
		}),
	onListen: (listening) => console.log(\`bun listening on \${listening.url}\`),
});
`,
	);
	return configFile(root, 'bun', (source) =>
		source.replace(
			"ssr: { external: ['@alxia/react-router', '@alxia/core'] }",
			"ssr: { external: ['@alxia/react-router', '@alxia/core'], noExternal: ['bun-inlined'] }",
		),
	);
}

const ANSWER = {
	inlined: 'bun-inlined:bun-variant',
	external: 'bun-external:bun-variant',
	two: 2,
	exists: false,
};

describe('react-router build, for Bun', () => {
	let fixture: Fixture;
	let bundle: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		await addBunPackages(fixture.root);
		await build(fixture.root, 'vite.bun.config.ts');
		bundle = await Bun.file(
			join(fixture.root, 'build', 'server', 'index.js'),
		).text();
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test("a bundled package's bun variant is the one in build/server/index.js", () => {
		expect(bundle).toContain('bun-inlined:bun-variant');
		expect(bundle).not.toContain('bun-inlined:node-variant');
	});

	test('bun, bun:sqlite and the external package stay imports of the bundle', () => {
		const imports = [
			...bundle.matchAll(/^import\s[^'"]*?from\s*["']([^"']+)["']/gm),
		].map((match) => match[1]);
		expect(imports).toContain('bun');
		expect(imports).toContain('bun:sqlite');
		expect(imports).toContain('bun-external');
	});

	test('bun build/server/index.js answers with both bun variants, SQLite and Bun.file', async () => {
		const { child, url } = await start(fixture.root, 'bun');
		try {
			const response = await fetch(new URL('/api/bun', url));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(ANSWER);
		} finally {
			child.kill();
		}
	});
});

describe('react-router dev, for Bun', () => {
	let fixture: Fixture;
	let server: ViteDevServer;
	let base: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		const config = await addBunPackages(fixture.root);
		({ server, base } = await devServer(fixture.root, { configFile: config }));
	}, 30_000);
	afterAll(async () => {
		await server?.close();
		await fixture?.remove();
	});

	test("the SSR runner loads the bun variants and Bun's own modules, as the build does", async () => {
		const response = await fetch(`${base}/api/bun`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(ANSWER);
	});
});
