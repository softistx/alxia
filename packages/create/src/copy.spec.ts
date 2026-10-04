import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { TEMPLATES as NAMES } from './args';
import { copyTemplate, TEMPLATES } from './copy';

const ALXIA = {
	'@alxia/client': '^0.2.1',
	'@alxia/core': '^0.3.0',
	'@alxia/react-router': '^0.2.0',
};

/** Every file a template stores, by its path under `templates/<name>/`. */
const storedPaths = (name: string) =>
	Array.fromAsync(
		new Bun.Glob('**').scan({ cwd: join(TEMPLATES, name), dot: true }),
	).then((paths) => paths.filter((path) => !path.endsWith('.DS_Store')));

describe('copyTemplate', () => {
	let root: string;
	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'alxia-copy-'));
		await Bun.write(
			join(root, 'api', 'package.json'),
			JSON.stringify({
				name: 'stored',
				dependencies: { '@alxia/core': 'workspace:^', zod: '^4.2.0' },
				devDependencies: {
					'@alxia/client': 'workspace:^',
					typescript: '^6.0.3',
				},
			}),
		);
		for (const file of ['gitignore', '_bunfig.toml', 'src/app.ts', '.DS_Store'])
			await Bun.write(join(root, 'api', file), file);
		await Bun.write(join(root, 'api', 'src', '.DS_Store'), '');
	});
	afterAll(() => rm(root, { recursive: true, force: true }));

	test("names the manifest and gives alxia's packages their ranges, in both dependency fields", async () => {
		const { manifest } = await copyTemplate('api', 'mine', ALXIA, root);
		expect(manifest).toEqual({
			name: 'mine',
			dependencies: { '@alxia/core': '^0.3.0', zod: '^4.2.0' },
			devDependencies: { '@alxia/client': '^0.2.1', typescript: '^6.0.3' },
		});
	});

	test('leaves out a dependency field the template has none of', async () => {
		await Bun.write(
			join(root, 'react-router', 'package.json'),
			JSON.stringify({ dependencies: { '@alxia/core': 'workspace:^' } }),
		);
		const { manifest } = await copyTemplate(
			'react-router',
			'mine',
			ALXIA,
			root,
		);
		expect(manifest).toEqual({
			name: 'mine',
			dependencies: { '@alxia/core': '^0.3.0' },
		});
	});

	test('refuses an @alxia/* package at workspace: it has no version for', async () => {
		await Bun.write(
			join(root, 'react-router', 'package.json'),
			JSON.stringify({ dependencies: { '@alxia/zod': 'workspace:^' } }),
		);
		await expect(
			copyTemplate('react-router', 'mine', ALXIA, root),
		).rejects.toThrow(
			'the react-router template names @alxia/zod at workspace:, which this @alxia/create has no version for',
		);
	});

	test('renames gitignore and _bunfig.toml, and leaves .DS_Store and package.json out', async () => {
		const { files } = await copyTemplate('api', 'mine', ALXIA, root);
		expect(Object.keys(files).sort()).toEqual([
			'.gitignore',
			'bunfig.toml',
			'src/app.ts',
		]);
		expect(await files['.gitignore']?.text()).toBe('gitignore');
		expect(await files['bunfig.toml']?.text()).toBe('_bunfig.toml');
	});
});

describe('the stored templates', () => {
	test('are the ones the command offers', async () => {
		const dirs = (await readdir(TEMPLATES, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		expect(dirs.sort()).toEqual([...NAMES].sort());
	});

	for (const name of NAMES) {
		describe(name, () => {
			test('holds no lockfile, no build output, nothing bun publish would drop', async () => {
				const paths = await storedPaths(name);
				expect(paths).toContain('gitignore');
				for (const path of paths) {
					expect(path).not.toMatch(
						/(^|\/)(\.gitignore|bunfig\.toml|\.npmrc|bun\.lockb?|package-lock\.json)$|(^|\/)(\.react-router|node_modules|build|dist)\//,
					);
				}
			});

			test('names no other package manager: its README, Dockerfile and scripts run Bun', async () => {
				const other = /(^|[\s`(])(npm|npx|pnpm|yarn) /m;
				const stored = (file: string) => Bun.file(join(TEMPLATES, name, file));
				const { scripts } = await stored('package.json').json();
				for (const [where, text] of [
					['README.md', await stored('README.md').text()],
					['Dockerfile', await stored('Dockerfile').text()],
					['package.json scripts', Object.values(scripts).join('\n')],
				] as const) {
					expect({ where, match: text.match(other)?.[0] ?? null }).toEqual({
						where,
						match: null,
					});
				}
				const dockerfile = await stored('Dockerfile').text();
				expect(dockerfile).toContain('RUN bun install --frozen-lockfile');
				expect(dockerfile).toContain('\nUSER bun\n');
			});

			test("names alxia's packages as workspace:^, which the copy replaces", async () => {
				const stored = await Bun.file(
					join(TEMPLATES, name, 'package.json'),
				).json();
				const { manifest } = await copyTemplate(name, 'mine', ALXIA);
				for (const field of ['dependencies', 'devDependencies'] as const) {
					for (const [pkg, range] of Object.entries(stored[field] ?? {})) {
						if (!pkg.startsWith('@alxia/')) continue;
						expect({ pkg, range }).toEqual({ pkg, range: 'workspace:^' });
						expect(manifest[field]?.[pkg]).toBe(
							ALXIA[pkg as keyof typeof ALXIA],
						);
					}
				}
				expect(JSON.stringify(manifest)).not.toContain('workspace:');
			});
		});
	}

	test('ship whole: every stored file is in the packed tarball', async () => {
		const out = await mkdtemp(join(tmpdir(), 'alxia-pack-'));
		try {
			const packed =
				await $`${process.execPath} pm pack --destination ${out} --quiet`
					.cwd(join(import.meta.dir, '..'))
					.quiet();
			// --quiet prints the tarball's path alone.
			const tarball = packed.stdout.toString().trim();
			const entries = new Set(
				(await $`tar -tzf ${tarball}`.quiet()).stdout.toString().split('\n'),
			);
			const missing: string[] = [];
			for (const name of NAMES) {
				for (const path of await storedPaths(name)) {
					const entry = `package/templates/${name}/${path}`;
					if (!entries.has(entry)) missing.push(entry);
				}
			}
			expect(missing).toEqual([]);
		} finally {
			await rm(out, { recursive: true, force: true });
		}
	}, 30_000);
});
