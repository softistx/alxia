import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALXIA } from '../test/templates';
import { TEMPLATES as NAMES } from './args';
import { copyTemplate, withName } from './copy';
import { packageName } from './target';

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
					'@alxia/react-router': 'workspace:^',
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
			devDependencies: {
				'@alxia/react-router': '^0.2.0',
				typescript: '^6.0.3',
			},
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

describe('withName', () => {
	test('replaces the placeholder as a whole word only', async () => {
		const file = new Blob([
			'docker build -t my-app .\nmy-app-old, my-apps, the-my-app, `my-app`\n',
		]);
		expect(await (await withName(file, 'my-app', 'web')).text()).toBe(
			'docker build -t web .\nmy-app-old, my-apps, the-my-app, `web`\n',
		);
	});

	test('gives back a file that names none, or is not text, as it is', async () => {
		const text = new Blob(['nothing here\n']);
		expect(await withName(text, 'my-app', 'web')).toBe(text);
		const icon = new Blob([new Uint8Array([0, 0, 1, 0, 0xff, 0xfe, 0x6d])]);
		expect(await withName(icon, 'my-app', 'web')).toBe(icon);
	});
});

describe('a project named "Mon Super Projet"', () => {
	for (const name of NAMES) {
		test(`${name}: no file names the template's own name, and its README's docker commands name the project`, async () => {
			const project = packageName('Mon Super Projet');
			expect(project).toBe('mon-super-projet');
			const { manifest, files } = await copyTemplate(name, project, ALXIA);
			expect(manifest['name']).toBe(project);
			const naming: string[] = [];
			for (const [path, file] of Object.entries(files)) {
				if (/\b(my-api|my-app)\b/.test(await file.text())) naming.push(path);
			}
			expect(naming).toEqual([]);
			const docker = ((await files['README.md']?.text()) ?? '')
				.split('\n')
				.filter((line) => /^docker (build|run) /.test(line));
			expect(docker.length).toBe(2);
			for (const line of docker) expect(line).toMatch(/ mon-super-projet( |$)/);
		});
	}
});
