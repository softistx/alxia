import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { ALXIA, storedPaths } from '../test/templates';
import { TEMPLATES as NAMES } from './args';
import { copyTemplate, TEMPLATES } from './copy';

describe('the stored templates', () => {
	test('pin @biomejs/biome exactly, at the version that checks them here, with the same scripts and style', async () => {
		const workspace = (
			await Bun.file(
				Bun.resolveSync('@biomejs/biome/package.json', import.meta.dir),
			).json()
		).version;
		const read = (name: string, file: string) =>
			Bun.file(join(TEMPLATES, name, file)).json();
		const stored = async (name: string) => ({
			manifest: await read(name, 'package.json'),
			config: await read(name, '_biome.json'),
		});
		const api = await stored('api');
		const biomeScripts = (scripts: Record<string, string>) =>
			Object.fromEntries(
				Object.entries(scripts).filter(([key]) =>
					['lint', 'format', 'check', 'check:ci'].includes(key),
				),
			);
		expect(biomeScripts(api.manifest.scripts)).toEqual({
			lint: 'biome lint',
			format: 'biome format --write',
			check: 'biome check --write',
			'check:ci': 'biome ci',
		});
		const settings = await Bun.file(
			join(TEMPLATES, 'api/.vscode/settings.json'),
		).text();
		for (const name of NAMES) {
			const { manifest, config } = await stored(name);
			expect(manifest.devDependencies['@biomejs/biome']).toBe(workspace);
			expect(biomeScripts(manifest.scripts)).toEqual(
				biomeScripts(api.manifest.scripts),
			);
			// One style for every new project, whichever template made it.
			for (const key of [
				'$schema',
				'vcs',
				'formatter',
				'javascript',
				'assist',
			]) {
				expect({ name, key, value: config[key] }).toEqual({
					name,
					key,
					value: api.config[key],
				});
			}
			expect(
				await Bun.file(join(TEMPLATES, name, '.vscode/settings.json')).text(),
			).toBe(settings);
		}
	});

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
						/(^|\/)(\.gitignore|bunfig\.toml|biome\.json|\.npmrc|bun\.lockb?|package-lock\.json)$|(^|\/)(\.react-router|node_modules|build|dist)\//,
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

			test('its Dockerfile builds, and its final stage holds the build output, no node_modules', async () => {
				const dockerfile = await Bun.file(
					join(TEMPLATES, name, 'Dockerfile'),
				).text();
				const stages = dockerfile.split(/^(?=FROM )/m).slice(1);
				expect(stages.length).toBeGreaterThanOrEqual(2);
				const final = stages.at(-1) ?? '';
				const building = stages.slice(0, -1);
				// Built on Debian's glibc, run on Alpine: the output is pure JS.
				for (const stage of building)
					expect(stage).toStartWith('FROM oven/bun:1 AS ');
				expect(final).toStartWith('FROM oven/bun:1-alpine\n');
				expect(
					building.some((stage) => /^RUN bun run build$/m.test(stage)),
				).toBe(true);
				// What the image holds is copied from the build stage alone.
				const copies = final.match(/^COPY .+$/gm) ?? [];
				expect(copies.length).toBeGreaterThan(0);
				for (const copy of copies) {
					expect(copy).toStartWith('COPY --from=build ');
					expect(copy).not.toContain('node_modules');
				}
				expect(final).not.toMatch(/^RUN bun install/m);
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
