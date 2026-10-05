import { describe, expect, test } from 'bun:test';
import {
	distAnswers,
	expectBiomeClean,
	expectDockerfile,
	expectSpecPasses,
	expectTypechecks,
	useFixture,
} from '../../test/project';
import { copyTemplate } from '../copy';
import { alxiaRanges } from '../versions';

const dir = useFixture('minimal');

describe('the minimal template', () => {
	test('is one dependency, alxia core, and the scripts its README names', async () => {
		const { manifest } = await copyTemplate(
			'minimal',
			'my-app',
			await alxiaRanges(),
		);
		expect(manifest['scripts']).toEqual({
			dev: 'NODE_ENV=development bun --hot src/index.ts',
			build:
				'bun build src/index.ts --target=bun --outdir=dist --minify --sourcemap=linked',
			start: 'NODE_ENV=production bun dist/index.js',
			test: 'bun test',
			typecheck: 'tsc --noEmit',
			lint: 'biome lint',
			format: 'biome format --write',
			check: 'biome check --write',
			'check:ci': 'biome ci',
			verify: 'bun run check:ci && bun run typecheck && bun run test',
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual(['@alxia/core']);
		// No OpenAPI, no code generation, no validator.
		expect(Object.keys(manifest.devDependencies ?? {})).toEqual([
			'@biomejs/biome',
			'@types/bun',
			'typescript',
		]);
	});

	test("its Dockerfile builds, and runs the start script's command on dist/ alone, as Bun's user, never installing", async () => {
		const { manifest, files } = await copyTemplate(
			'minimal',
			'my-app',
			await alxiaRanges(),
		);
		await expectDockerfile(
			'minimal',
			manifest['scripts'] as Record<string, string>,
			(await files['Dockerfile']?.text()) ?? '',
		);
	});

	test('bun run build makes a dist/ that answers alone, as the entry, and stops on SIGTERM', async () => {
		let body: unknown;
		const status = await distAnswers(dir, 'dist/index.js', async (base) => {
			const response = await fetch(base);
			body = await response.clone().json();
			return response;
		});
		expect(status).toBe(200);
		expect(body).toEqual({ hello: 'world' });
	}, 30_000);

	test('bun run check:ci passes on the project and its build: no error, warning or info', () =>
		expectBiomeClean(dir, 'dist/index.js'));

	test("typechecks under this repository's strictest settings", () =>
		expectTypechecks(dir));

	test('its spec passes', () => expectSpecPasses(dir, 2), 30_000);

	test('stays one small file: the route, in src/index.ts', async () => {
		const { files } = await copyTemplate(
			'minimal',
			'my-app',
			await alxiaRanges(),
		);
		const source = (await files['src/index.ts']?.text()) ?? '';
		expect(source).toContain('alxia().get("/"');
		expect(source.split('\n').length).toBeLessThan(25);
	});
});
