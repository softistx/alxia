import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import {
	distAnswers,
	distRefuses,
	expectBiomeClean,
	expectDockerfile,
	expectSpecPasses,
	expectTypechecks,
	useFixture,
} from '../../test/project';
import { copyTemplate } from '../copy';
import { alxiaRanges } from '../versions';

const dir = useFixture('api');

describe('the api template', () => {
	test("its manifest: alxia's versions, and the scripts its README names", async () => {
		const { manifest } = await copyTemplate(
			'api',
			'my-api',
			await alxiaRanges(),
		);
		expect(manifest['scripts']).toEqual({
			generate: 'nxgt-openapi generate',
			dev: 'NODE_ENV=development bun --watch src/server.ts',
			build:
				'bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked',
			start: 'NODE_ENV=production bun dist/server.js',
			test: 'bun test',
			typecheck: 'tsc --noEmit',
			lint: 'biome lint',
			format: 'biome format --write',
			check: 'biome check --write',
			'check:ci': 'biome ci',
			verify:
				'bun run generate --check && bun run check:ci && bun run typecheck && bun run test',
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([
			'@alxia/core',
			'@alxia/env',
			'@alxia/openapi',
			'zod',
		]);
		expect(Object.keys(manifest.devDependencies ?? {})).toEqual([
			'@biomejs/biome',
			'@nxgt/openapi-codegen',
			'@types/bun',
			'openapi-fetch',
			'typescript',
		]);
	});

	test("its Dockerfile builds, and runs the start script's command on dist/ alone, as Bun's user, never installing", async () => {
		const { manifest, files } = await copyTemplate(
			'api',
			'my-api',
			await alxiaRanges(),
		);
		await expectDockerfile(
			'api',
			manifest['scripts'] as Record<string, string>,
			(await files['Dockerfile']?.text()) ?? '',
		);
	});

	test('bun run build makes a dist/ that answers alone, with no node_modules: its routes, /health, and /docs from the bundled openapi.yaml', async () => {
		const answers: number[] = [];
		const status = await distAnswers(
			dir,
			'dist/server.js',
			async (base) => {
				for (const path of ['/health', '/docs', '/docs/openapi.json']) {
					answers.push((await fetch(new URL(path, base))).status);
				}
				return fetch(new URL('/todos', base), {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'x-api-key': 'k' },
					body: JSON.stringify({ title: 'From dist alone' }),
				});
			},
			{ API_KEY: 'k', API_DOCS: 'true' },
		);
		expect(status).toBe(201);
		expect(answers).toEqual([200, 200, 200]);
	}, 30_000);

	test('dist/ refuses to start without API_KEY outside development and test', async () => {
		const exit = await distRefuses(dir, 'dist/server.js', {
			NODE_ENV: 'production',
		});
		expect(exit.code).not.toBe(0);
		expect(exit.output).toContain('API_KEY');
	}, 30_000);

	test('bun run check:ci passes on the project and its build: no error, warning or info', () =>
		expectBiomeClean(dir, 'dist/server.js'));

	test('its src/generated/ is what its @nxgt/openapi-codegen writes from openapi.yaml', async () => {
		// The version this repository installs, the one the template pins.
		const result = await $`${process.execPath} run generate --check`
			.cwd(dir)
			.nothrow()
			.quiet();
		expect(`${result.stdout}${result.stderr}`).toContain(
			'src/generated: up to date',
		);
		expect(result.exitCode).toBe(0);
	});

	test('api pins @nxgt/openapi-codegen exactly, at the version that wrote its src/generated/', async () => {
		const read = (file: string) =>
			Bun.file(join(import.meta.dir, '..', '..', file)).json();
		const pinned = (await read('templates/api/package.json')).devDependencies[
			'@nxgt/openapi-codegen'
		];
		// @alxia/create's own devDependency, which this spec runs --check with.
		expect(pinned).toBe(
			(await read('package.json')).devDependencies['@nxgt/openapi-codegen'],
		);
		const installed = await Bun.file(
			Bun.resolveSync('@nxgt/openapi-codegen/package.json', import.meta.dir),
		).json();
		expect(pinned).toBe(installed.version);
	});

	test('its .env.example names each variable src/env.ts declares', async () => {
		const { files } = await copyTemplate('api', 'my-api', await alxiaRanges());
		const example = (await files['.env.example']?.text()) ?? '';
		const source = (await files['src/env.ts']?.text()) ?? '';
		const read = [...source.matchAll(/^\s+([A-Z_]+): /gm)].map(
			([, name]) => name,
		);
		expect(read.sort()).toEqual(['API_DOCS', 'API_KEY', 'PORT']);
		for (const name of read)
			expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
	});

	test("typechecks under this repository's strictest settings", () =>
		expectTypechecks(dir));

	test('its spec passes', () => expectSpecPasses(dir, 8), 30_000);
});
