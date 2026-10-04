import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { alxiaRanges } from '../versions';
import { apiFiles, apiManifest } from './api';

// Inside the package, so the project resolves @alxia/core, @alxia/client and
// zod to this workspace's: the template typechecks and passes its own spec
// against them with no install. scripts/verify-templates.ts does the same
// from the packed tarballs, installed.
const dir = join(import.meta.dir, '..', '..', '.fixture-api');

beforeAll(async () => {
	await rm(dir, { recursive: true, force: true });
	for (const [file, content] of Object.entries(apiFiles('fixture-api'))) {
		await Bun.write(join(dir, file), content);
	}
	await Bun.write(
		join(dir, 'package.json'),
		JSON.stringify(apiManifest('fixture-api', await alxiaRanges()), null, 2),
	);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('the api template', () => {
	test("its manifest: alxia's versions, and the scripts its README names", async () => {
		const manifest = apiManifest('my-api', await alxiaRanges());
		expect(manifest['scripts']).toEqual({
			dev: 'bun --watch src/server.ts',
			build: 'bun build src/server.ts --target=bun --outdir=dist',
			start: 'bun dist/server.js',
			test: 'bun test',
			typecheck: 'tsc --noEmit',
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([
			'@alxia/core',
			'zod',
		]);
		expect(Object.keys(manifest.devDependencies ?? {})).toEqual([
			'@alxia/client',
			'@types/bun',
			'typescript',
		]);
	});

	test("typechecks under this repository's strictest settings", async () => {
		const result = // The workspace's tsc, from node_modules/.bin, on Bun: TypeScript 7 exports
			// no bin/tsc to resolve, and a runner may have no node.
			await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
				.cwd(import.meta.dir)
				.nothrow()
				.quiet();
		expect(result.stdout.toString()).toBe('');
		expect(result.exitCode).toBe(0);
	});

	test('its spec passes', async () => {
		const result = await $`${process.execPath} test`.cwd(dir).nothrow().quiet();
		const output = result.stderr.toString();
		expect(output).toContain(' 3 pass');
		expect(output).toContain(' 0 fail');
		expect(result.exitCode).toBe(0);
	}, 30_000);
});
