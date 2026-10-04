import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	addBiome,
	addLintSection,
	BIOME_CONFIG,
	BIOME_SCRIPTS,
	type BiomeManifest,
	LINT_SECTION,
} from './biome';

const ROOT = join(import.meta.dir, '..', '..');
const SCRIPTS = { build: 'react-router build', dev: 'react-router dev' };

describe('addBiome', () => {
	test('adds the scripts and @biomejs/biome, pinned and sorted among the devDependencies', () => {
		const scaffold: BiomeManifest = {
			scripts: SCRIPTS,
			devDependencies: { '@react-router/dev': '^8.4.0', vite: '^8.0.3' },
		};
		const manifest = addBiome(scaffold, '2.5.15');
		expect(manifest.scripts).toEqual({
			...SCRIPTS,
			...BIOME_SCRIPTS,
		});
		expect(manifest.devDependencies).toEqual({
			'@biomejs/biome': '2.5.15',
			'@react-router/dev': '^8.4.0',
			vite: '^8.0.3',
		});
		expect(Object.keys(manifest.devDependencies ?? {})[0]).toBe(
			'@biomejs/biome',
		);
	});
});

describe('addLintSection', () => {
	test('puts the section before Styling', () => {
		expect(addLintSection('# App\n\n## Styling\n\nTailwind.\n')).toBe(
			`# App\n\n${LINT_SECTION}## Styling\n\nTailwind.\n`,
		);
	});

	test('refuses a README with no Styling section', () => {
		expect(() => addLintSection('# App\n')).toThrow(
			'README.md: expected a ## Styling section',
		);
	});
});

describe('the committed template', () => {
	const TEMPLATE = join(ROOT, 'packages/create/templates/react-router');

	test("its README has LINT_SECTION, and the api template's README the same but for verify", async () => {
		expect(await Bun.file(join(TEMPLATE, 'README.md')).text()).toContain(
			LINT_SECTION,
		);
		const api = await Bun.file(
			join(ROOT, 'packages/create/templates/api/README.md'),
		).text();
		expect(api).toContain(
			LINT_SECTION.replace(
				/What the build and[\s\S]*?is skipped\./,
				'What the build writes, `dist/`, is skipped.',
			)
				.replaceAll('```bash', '```sh')
				.replace(
					'check:ci, then typecheck, then build',
					'check:ci, then typecheck, then test',
				),
		);
	});

	test('stores BIOME_CONFIG as _biome.json', async () => {
		expect(await Bun.file(join(TEMPLATE, '_biome.json')).json()).toEqual(
			BIOME_CONFIG,
		);
	});

	test("has BIOME_SCRIPTS, and the api template's but for verify's last step", async () => {
		const { scripts } = await Bun.file(join(TEMPLATE, 'package.json')).json();
		expect(scripts).toMatchObject(BIOME_SCRIPTS);
		const api = (
			await Bun.file(
				join(ROOT, 'packages/create/templates/api/package.json'),
			).json()
		).scripts;
		expect({ ...api, verify: BIOME_SCRIPTS.verify }).toMatchObject(
			BIOME_SCRIPTS,
		);
	});
});
