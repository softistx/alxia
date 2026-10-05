import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import {
	distAnswers,
	expectBiomeClean,
	expectDockerfile,
	expectSpecPasses,
	expectTypechecks,
	useFixture,
} from '../../test/project';
import { copyTemplate } from '../copy';
import { KEPT_EXACT } from '../registry';
import { alxiaRanges } from '../versions';

const dir = useFixture('graphql');
const CODEGEN = [
	'@graphql-codegen/cli',
	'@graphql-codegen/typescript',
	'@graphql-codegen/typescript-resolvers',
];

describe('the graphql template', () => {
	test("its manifest: alxia's versions, Yoga as a dependency, and the scripts its README names", async () => {
		const { manifest } = await copyTemplate(
			'graphql',
			'my-graphql-api',
			await alxiaRanges(),
		);
		expect(manifest['scripts']).toEqual({
			generate: 'graphql-codegen --config codegen.ts',
			dev: 'bun --watch src/server.ts',
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
			'@alxia/graphql',
			'graphql',
			'graphql-yoga',
			'zod',
		]);
	});

	test("its Dockerfile builds, and runs the start script's command on dist/ alone, as Bun's user, never installing", async () => {
		const { manifest, files } = await copyTemplate(
			'graphql',
			'my-graphql-api',
			await alxiaRanges(),
		);
		await expectDockerfile(
			'graphql',
			manifest['scripts'] as Record<string, string>,
			(await files['Dockerfile']?.text()) ?? '',
		);
	});

	test('bun run build makes a dist/ that answers { __typename } alone, schema.graphql inside', async () => {
		let body: unknown;
		const status = await distAnswers(dir, 'dist/server.js', async (base) => {
			const response = await fetch(new URL('/graphql', base), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: '{ __typename }' }),
			});
			body = await response.clone().json();
			return response;
		});
		expect(status).toBe(200);
		expect(body).toEqual({ data: { __typename: 'Query' } });
	}, 30_000);

	test('bun run check:ci passes on the project and its build: no error, warning or info', () =>
		expectBiomeClean(dir, 'dist/server.js'));

	test('its src/generated/ is what its GraphQL Code Generator writes from schema.graphql', async () => {
		const result = await $`${process.execPath} run generate --check`
			.cwd(dir)
			.nothrow()
			.quiet();
		expect(result.exitCode).toBe(0);
		expect(`${result.stdout}${result.stderr}`).not.toContain('stale files');
	});

	test('pins the generator exactly, at the versions that wrote src/generated/, and keeps the pins', async () => {
		const read = (file: string) =>
			Bun.file(join(import.meta.dir, '..', '..', file)).json();
		const pinned = (await read('templates/graphql/package.json'))
			.devDependencies;
		const own = (await read('package.json')).devDependencies;
		for (const name of CODEGEN) {
			expect(KEPT_EXACT.has(name)).toBe(true);
			// @alxia/create's own devDependency, which this spec runs --check with.
			expect(pinned[name]).toBe(own[name]);
			const installed = await Bun.file(
				Bun.resolveSync(`${name}/package.json`, import.meta.dir),
			).json();
			expect(pinned[name]).toBe(installed.version);
		}
	});

	test('its .env.example names each variable src/env.ts declares', async () => {
		const { files } = await copyTemplate(
			'graphql',
			'my-graphql-api',
			await alxiaRanges(),
		);
		const example = (await files['.env.example']?.text()) ?? '';
		const source = (await files['src/env.ts']?.text()) ?? '';
		const read = [...source.matchAll(/^\s+(\w+): z\b/gm)].map(
			([, name]) => name,
		);
		expect(read.sort()).toEqual(['NODE_ENV', 'PORT']);
		for (const name of read)
			expect(example).toMatch(new RegExp(`^(# )?${name}=`, 'm'));
	});

	test("typechecks under this repository's strictest settings", () =>
		expectTypechecks(dir));

	test('its spec passes', () => expectSpecPasses(dir, 6), 30_000);
});
