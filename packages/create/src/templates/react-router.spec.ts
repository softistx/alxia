import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	SCAFFOLD_MANIFEST,
	SCAFFOLD_VITE_CONFIG,
	writeScaffold,
} from '../../test/scaffold';
import {
	addAlxia,
	addPlugin,
	alxiaLayer,
	BUNFIG,
	ScaffoldChanged,
	scaffoldCommand,
} from './react-router';

const ALXIA = {
	'@alxia/client': '^0.2.1',
	'@alxia/core': '^0.3.0',
	'@alxia/react-router': '^0.2.0',
};

const dirs: string[] = [];
afterAll(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});
async function scaffolded(edit?: Parameters<typeof writeScaffold>[1]) {
	const dir = await mkdtemp(join(tmpdir(), 'alxia-create-rr-'));
	dirs.push(dir);
	await writeScaffold(dir, edit);
	return dir;
}

describe('scaffoldCommand', () => {
	test('the newest create-react-router of the major @alxia/react-router accepts, asking nothing, installing nothing', () => {
		expect(scaffoldCommand('my-app')).toEqual([
			'create-react-router@8',
			'my-app',
			'--yes',
			'--no-install',
			'--no-git-init',
			'--no-agent-skills',
			'--no-motion',
		]);
	});
});

describe('addPlugin', () => {
	test('adds alxia() after reactRouter(), and its import first, as examples/react-router has it', async () => {
		expect(addPlugin(SCAFFOLD_VITE_CONFIG)).toBe(
			await Bun.file(
				new URL(
					'../../../../examples/react-router/vite.config.ts',
					import.meta.url,
				),
			).text(),
		);
	});

	test('refuses a config with no reactRouter() in its plugins, or with alxia already', () => {
		expect(() => addPlugin('export default {};\n')).toThrow(ScaffoldChanged);
		expect(() =>
			addPlugin(
				SCAFFOLD_VITE_CONFIG.replace(
					'reactRouter()]',
					'reactRouter(), reactRouter()]',
				),
			),
		).toThrow(ScaffoldChanged);
		expect(() => addPlugin(addPlugin(SCAFFOLD_VITE_CONFIG))).toThrow(
			'it already imports @alxia/react-router/vite',
		);
	});
});

describe('addAlxia', () => {
	test('adds @alxia/core and @alxia/react-router, sorted, and starts the build on Bun', () => {
		const manifest = addAlxia(structuredClone(SCAFFOLD_MANIFEST), ALXIA);
		expect(manifest['scripts']).toEqual({
			...SCAFFOLD_MANIFEST.scripts,
			start: 'bun build/server/index.js',
		});
		expect(Object.keys(manifest.dependencies ?? {})).toEqual([
			'@alxia/core',
			'@alxia/react-router',
			'@react-router/node',
			'@react-router/serve',
			'isbot',
			'react',
			'react-dom',
			'react-router',
		]);
		expect(manifest.dependencies?.['@alxia/core']).toBe('^0.3.0');
		expect(manifest.dependencies?.['@alxia/react-router']).toBe('^0.2.0');
		expect(manifest.devDependencies).toEqual(SCAFFOLD_MANIFEST.devDependencies);
	});

	test("refuses a manifest whose scripts are not React Router's", () => {
		const manifest = structuredClone(SCAFFOLD_MANIFEST);
		manifest.scripts.dev = 'vite';
		expect(() => addAlxia(manifest, ALXIA)).toThrow(
			"create-react-router's package.json is not what this @alxia/create expects",
		);
	});
});

describe('alxiaLayer', () => {
	test('reads the scaffold and returns the edits, writing nothing', async () => {
		const dir = await scaffolded();
		const { manifest, files } = await alxiaLayer(dir, ALXIA);
		expect(manifest.dependencies?.['@alxia/react-router']).toBe('^0.2.0');
		expect(files).toEqual({
			'vite.config.ts': addPlugin(SCAFFOLD_VITE_CONFIG),
			'bunfig.toml': BUNFIG,
		});
		expect(await Bun.file(join(dir, 'vite.config.ts')).text()).toBe(
			SCAFFOLD_VITE_CONFIG,
		);
	});

	test("the bunfig.toml is examples/react-router's", async () => {
		expect(BUNFIG).toBe(
			await Bun.file(
				new URL(
					'../../../../examples/react-router/bunfig.toml',
					import.meta.url,
				),
			).text(),
		);
	});

	test('refuses a scaffold with no vite.config.ts, or one with a bunfig.toml', async () => {
		const missing = await scaffolded();
		await rm(join(missing, 'vite.config.ts'));
		await expect(alxiaLayer(missing, ALXIA)).rejects.toThrow(
			"create-react-router's vite.config.ts is not what this @alxia/create expects: it is missing",
		);
		const bunfig = await scaffolded();
		await Bun.write(join(bunfig, 'bunfig.toml'), '');
		await expect(alxiaLayer(bunfig, ALXIA)).rejects.toThrow(ScaffoldChanged);
	});
});
