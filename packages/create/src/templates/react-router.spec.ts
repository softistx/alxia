import { afterAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { copyTemplate, RENAMED } from '../copy';
import { PEER_RANGES } from '../versions';

const TEMPLATE = fileURLToPath(
	new URL('../../templates/react-router', import.meta.url),
);
const EXAMPLE = new URL('../../../../examples/react-router/', import.meta.url);
const ALXIA = {
	'@alxia/client': '^0.2.1',
	'@alxia/core': '^0.3.0',
	'@alxia/react-router': '^0.2.0',
};

const stored = (file: string) => Bun.file(`${TEMPLATE}/${file}`);

describe('the stored template', () => {
	// The template and the example are the same official scaffold with the
	// same alxia layer: these two files keep them in step.
	for (const [file, storedAs] of [
		['vite.config.ts', 'vite.config.ts'],
		['bunfig.toml', '_bunfig.toml'],
		['Dockerfile', 'Dockerfile'],
	] as const) {
		test(`its ${file} is examples/react-router's`, async () => {
			expect(await stored(storedAs).text()).toBe(
				await Bun.file(new URL(file, EXAMPLE)).text(),
			);
		});
	}

	test('its React Router is the major @alxia/react-router accepts', async () => {
		const { dependencies, devDependencies } =
			await stored('package.json').json();
		for (const version of [
			dependencies['react-router'],
			devDependencies['@react-router/dev'],
		]) {
			expect(
				Bun.semver.satisfies(
					version.replace(/^\^/, ''),
					PEER_RANGES['react-router'],
				),
			).toBe(true);
		}
	});
});

describe("copyTemplate('react-router')", () => {
	test("names the manifest, gives alxia's packages their ranges, and starts the build on Bun", async () => {
		const { manifest } = await copyTemplate('react-router', 'web', ALXIA);
		expect(manifest['name']).toBe('web');
		expect(manifest['scripts']).toEqual({
			build: 'react-router build',
			dev: 'react-router dev',
			start: 'bun build/server/index.js',
			typecheck: 'react-router typegen && tsc',
			lint: 'biome lint',
			format: 'biome format --write',
			check: 'biome check --write',
			'check:ci': 'biome ci',
			verify: 'bun run check:ci && bun run typecheck && bun run build',
		});
		expect(manifest.dependencies).toMatchObject({
			'@alxia/core': '^0.3.0',
			'@alxia/react-router': '^0.2.0',
		});
		expect(manifest.dependencies?.['@alxia/client']).toBeUndefined();
		expect(JSON.stringify(manifest)).not.toContain('workspace:');
	});

	test('every other file as stored, gitignore as .gitignore and _bunfig.toml as bunfig.toml', async () => {
		const { files } = await copyTemplate('react-router', 'web', ALXIA);
		const paths = Object.keys(files);
		expect(paths).not.toContain('gitignore');
		expect(paths).not.toContain('_bunfig.toml');
		expect(paths).not.toContain('package.json');
		expect(paths).toEqual(
			expect.arrayContaining([
				'.gitignore',
				'.dockerignore',
				'Dockerfile',
				'README.md',
				'.vscode/extensions.json',
				'.vscode/settings.json',
				'app/root.tsx',
				'app/routes.ts',
				'biome.json',
				'bunfig.toml',
				'public/favicon.ico',
				'react-router.config.ts',
				'tsconfig.json',
				'vite.config.ts',
			]),
		);
		for (const [from, to] of Object.entries(RENAMED)) {
			expect(await files[to]?.text()).toBe(await stored(from).text());
		}
		expect(await files['public/favicon.ico']?.bytes()).toEqual(
			await stored('public/favicon.ico').bytes(),
		);
	});
});

describe('a project from the template', () => {
	// Inside the package, so `bun run` finds the workspace's biome. The
	// generated output it must skip is faked, unformatted: verify:templates
	// runs the same check after the real react-router typegen and build.
	const dir = join(import.meta.dir, '..', '..', '.fixture-react-router');
	afterAll(() => rm(dir, { recursive: true, force: true }));

	test('passes bun run check:ci, skipping .react-router/ and build/: no error, warning or info', async () => {
		await rm(dir, { recursive: true, force: true });
		const { manifest, files } = await copyTemplate(
			'react-router',
			'web',
			ALXIA,
		);
		for (const [file, content] of Object.entries(files)) {
			await Bun.write(join(dir, file), content);
		}
		await Bun.write(
			join(dir, 'package.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		const unformatted = "export  const   x = 'generated'  ;\n";
		await Bun.write(
			join(dir, '.react-router/types/app/+types/root.ts'),
			unformatted,
		);
		await Bun.write(join(dir, 'build/server/index.js'), unformatted);
		const result = await $`${process.execPath} run check:ci --colors=off`
			.cwd(dir)
			.nothrow()
			.quiet();
		const output = `${result.stdout}${result.stderr}`;
		expect(output).not.toMatch(/Found \d+ (error|warning|info)/);
		expect(output).not.toContain('.react-router');
		expect(output).not.toContain('build/server');
		expect(output).toMatch(/Checked \d+ files/);
		expect(result.exitCode).toBe(0);
	});
});
