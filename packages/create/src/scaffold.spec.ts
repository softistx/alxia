import { describe, expect, test } from 'bun:test';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
	ALXIA,
	type FakeOptions,
	fake,
	json,
	useProject,
	VERSIONS,
} from '../test/main';
import { fakeRegistry } from '../test/registry';
import { main } from './main';
import { write } from './write';

const project = useProject();
/** A fake terminal asking this test's registry. */
const ask = (options: FakeOptions = {}) => fake(project.registry.url, options);

const TEMPLATE = new URL('../templates/react-router/', import.meta.url);

describe('create-alxia: the project written', () => {
	test("api: the manifest at alxia's versions, the rest at the registry's newest", async () => {
		const { io, out, ran } = ask();
		expect(
			await main(
				['my-api', '--template', 'api', '--no-install'],
				project.root,
				io,
			),
		).toBe(0);
		expect(
			await json(join(project.root, 'my-api', 'package.json')),
		).toMatchObject({
			name: 'my-api',
			dependencies: { '@alxia/core': ALXIA['@alxia/core'], zod: '^4.6.5' },
			devDependencies: {
				'@alxia/openapi': ALXIA['@alxia/openapi'],
				// Pinned exactly, as its output is committed: never moved, so
				// `verify` still passes when a newer patch writes differently.
				'@nxgt/openapi-codegen': '0.7.0',
				'@types/bun': '^1.4.2',
				typescript: '^7.0.2',
			},
		});
		expect(out).toContain('  typescript ^6.0.3 -> ^7.0.2');
		expect(ran).toEqual([]);
		expect(out.at(-1)).toBe(
			'\nDone: my-api holds the api template. Next:\n\n  cd my-api\n  bun install\n  bun dev\n',
		);
	});

	test('refuses a directory that is not empty, and leaves it as it was', async () => {
		const dir = join(project.root, 'taken');
		await Bun.write(join(dir, 'notes.txt'), 'mine');
		const { io, err } = ask();
		expect(await main(['taken', '--template', 'api'], project.root, io)).toBe(
			1,
		);
		expect(err).toEqual([
			'create-alxia: taken is not empty (notes.txt), and create-alxia writes only into an empty directory. Choose another directory, or empty this one.',
		]);
		expect(await readdir(dir)).toEqual(['notes.txt']);
	});

	test('names only the first three entries of a directory that is not empty', async () => {
		for (const file of ['a', 'b', 'c', 'd'])
			await Bun.write(join(project.root, 'taken', file), '');
		const { io, err } = ask();
		expect(await main(['taken', '--template', 'api'], project.root, io)).toBe(
			1,
		);
		expect(err[0]).toStartWith(
			'create-alxia: taken is not empty (a, b, c, ...), and',
		);
	});

	test('refuses a file in place of the directory', async () => {
		await Bun.write(join(project.root, 'taken'), 'a file');
		const { io, err } = ask();
		expect(await main(['taken', '--template', 'api'], project.root, io)).toBe(
			1,
		);
		expect(err).toEqual(['create-alxia: taken exists and is not a directory.']);
	});

	test('writes into an empty directory it is run in, with no cd to take', async () => {
		const dir = join(project.root, 'here');
		await mkdir(dir);
		const { io, out } = ask();
		expect(await main(['.', '--template', 'api'], dir, io)).toBe(0);
		expect((await json(join(dir, 'package.json'))).name).toBe('here');
		expect(out.at(-1)).toBe(
			'\nDone: this directory holds the api template. Next:\n\n  bun dev\n',
		);
	});

	test('react-router: the stored template copied, alxia at its versions, the rest at the newest', async () => {
		const { io, ran } = ask();
		expect(
			await main(['web', '--template', 'react-router'], project.root, io),
		).toBe(0);
		const dir = join(project.root, 'web');
		// Nothing but bun install runs: no create-react-router.
		expect(ran).toEqual([{ command: [process.execPath, 'install'], cwd: dir }]);
		const manifest = await json(join(dir, 'package.json'));
		expect(manifest.name).toBe('web');
		expect(manifest.scripts.start).toBe('bun build/server/index.js');
		expect(manifest.dependencies).toEqual({
			'@alxia/core': ALXIA['@alxia/core'],
			'@alxia/react-router': ALXIA['@alxia/react-router'],
			'@react-router/node': '^8.4.0',
			'@react-router/serve': '^8.4.0',
			isbot: '^5.2.2',
			react: '^19.3.0',
			'react-dom': '^19.3.0',
			'react-router': '^8.4.0',
		});
		expect(manifest.devDependencies.typescript).toBe('^7.0.2');
		for (const [file, stored] of [
			['vite.config.ts', 'vite.config.ts'],
			['app/root.tsx', 'app/root.tsx'],
			['.gitignore', 'gitignore'],
			['bunfig.toml', '_bunfig.toml'],
		] as const) {
			expect(await Bun.file(join(dir, file)).text()).toBe(
				await Bun.file(new URL(stored, TEMPLATE)).text(),
			);
		}
		expect(await Bun.file(join(dir, 'gitignore')).exists()).toBe(false);
		expect(await Bun.file(join(dir, '_bunfig.toml')).exists()).toBe(false);
	});

	test('an @alxia/* version npm has not propagated yet: the newest of its minor, still within its range', async () => {
		// Fixed ranges, not this checkout's: at x.y.0 nothing older shares the minor.
		const published = {
			'@alxia/core': '^0.3.1',
			'@alxia/openapi': ALXIA['@alxia/openapi'],
			'@alxia/react-router': '^0.2.0',
		};
		project.registry.stop();
		project.registry = fakeRegistry({
			...VERSIONS,
			// 0.3.1 published a minute ago, not on this registry yet.
			'@alxia/core': ['0.2.9', '0.3.0'],
		});
		const { io, out, err } = ask();
		const target = join(project.root, 'my-api');
		expect(await write(target, 'api', published, io)).toBe(true);
		const manifest = await json(join(target, 'package.json'));
		expect(manifest.dependencies['@alxia/core']).toBe('^0.3.0');
		expect(out).toContain(
			'  @alxia/core: the registry has no release within ^0.3.1 yet; wrote ^0.3.0, the newest of ~0.3.0',
		);
		expect(err).toEqual([]);
	});

	test('a registry that does not answer: the template versions kept, with a warning', async () => {
		const { io, err } = ask({ registryUrl: 'http://localhost:1' });
		expect(
			await main(
				['my-api', '--template', 'api', '--no-install'],
				project.root,
				io,
			),
		).toBe(0);
		expect(err[0]).toBe(
			'create-alxia: warning: the registry did not answer for @alxia/core, zod, @alxia/openapi, @biomejs/biome, @types/bun, typescript; kept the versions the template ships.',
		);
		expect(
			(await json(join(project.root, 'my-api', 'package.json'))).devDependencies
				.typescript,
		).toBe('^6.0.3');
	});

	test('bun install failing: exit 1, the files kept, and bun install among the next steps', async () => {
		const { io, err, out } = ask({ codes: { install: 1 } });
		expect(await main(['my-api', '--template', 'api'], project.root, io)).toBe(
			1,
		);
		expect(err).toEqual([
			'create-alxia: bun install failed; the files are written.',
		]);
		expect(out.at(-1)).toContain('  cd my-api\n  bun install\n  bun dev');
		expect(
			await Bun.file(join(project.root, 'my-api', 'package.json')).exists(),
		).toBe(true);
	});
});
