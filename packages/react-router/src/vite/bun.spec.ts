import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { resolveConfig } from 'vite';
import { copyFixture } from '../../test/fixture';
import { configFile, type Fixture } from '../../test/vite';
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

	test("ssr.target: 'webworker', the app's own choice, keeps Vite's defaults", async () => {
		const worker = await configFile(fixture.root, 'worker', (source) =>
			source.replace(
				"ssr: { external: ['@alxia/react-router', '@alxia/core'] }",
				"ssr: { target: 'webworker', external: ['@alxia/react-router', '@alxia/core'] }",
			),
		);
		const ssr = await ssrOf('build', worker);
		expect(ssr.resolve.conditions).not.toContain('bun');
		expect(ssr.resolve.externalConditions).not.toContain('bun');
		expect(ssr.build.target).not.toBe('esnext');
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
