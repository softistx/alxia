import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type FakeOptions, fake, json, useProject } from '../test/main';
import { main, packageName, USAGE } from './main';

const project = useProject();
/** A fake terminal asking this test's registry. */
const ask = (options: FakeOptions = {}) => fake(project.registry.url, options);

describe('create-alxia', () => {
	test('--help prints the usage', async () => {
		const { io, out } = ask();
		expect(await main(['--help'], project.root, io)).toBe(0);
		expect(out).toEqual([USAGE]);
	});

	test('refuses an argument it does not know, with the usage', async () => {
		const { io, err } = ask();
		expect(await main(['app', '--template', 'vue'], project.root, io)).toBe(1);
		expect(err).toEqual([
			`create-alxia: unknown template vue: use api or react-router.\n\n${USAGE}`,
		]);
	});

	test('with no terminal, refuses to guess a directory or a template', async () => {
		const first = ask();
		expect(await main([], project.root, first.io)).toBe(1);
		expect(first.err[0]).toStartWith(
			'create-alxia: no directory given, and no terminal to ask in.',
		);
		const second = ask();
		expect(await main(['app'], project.root, second.io)).toBe(1);
		expect(second.err[0]).toStartWith(
			'create-alxia: no --template given, and no terminal to ask in.',
		);
	});

	test('with no arguments, asks the directory, then the template, then installs', async () => {
		const { io, out, ran } = ask({ answers: ['my-api', 'api'] });
		expect(await main([], project.root, io)).toBe(0);
		const dir = join(project.root, 'my-api');
		expect((await readdir(dir)).sort()).toEqual([
			'.dockerignore',
			'.env.example',
			'.gitignore',
			'.vscode',
			'Dockerfile',
			'README.md',
			'biome.json',
			'openapi-codegen.config.ts',
			'openapi.yaml',
			'package.json',
			'src',
			'tsconfig.json',
		]);
		// Pinned exactly, as Biome asks, and held to the template's minor.
		expect(
			(await json(join(dir, 'package.json'))).devDependencies['@biomejs/biome'],
		).toBe('2.5.16');
		expect(ran).toEqual([{ command: [process.execPath, 'install'], cwd: dir }]);
		expect(out.at(-1)).toBe(
			'\nDone: my-api holds the api template. Next:\n\n  cd my-api\n  bun dev\n',
		);
	});

	test('input ended at a question (Ctrl-D): cancelled, nothing written', async () => {
		for (const answers of [[null], ['my-api', null]]) {
			const { io, err } = ask({ answers });
			expect(await main([], project.root, io)).toBe(1);
			expect(err).toEqual(['create-alxia: cancelled, nothing written.']);
			expect(await readdir(project.root)).toEqual([]);
		}
	});

	test('an unknown template answered is refused', async () => {
		const { io, err } = ask({ answers: ['my-api', 'vue'] });
		expect(await main([], project.root, io)).toBe(1);
		expect(err[0]).toStartWith(
			'create-alxia: unknown template vue: use api or react-router.',
		);
	});
});

describe('packageName', () => {
	test("the directory's name, as npm accepts one", () => {
		expect(packageName('/x/My App!')).toBe('my-app');
		expect(packageName('/x/.hidden')).toBe('hidden');
		expect(packageName('/x/___')).toBe('alxia-app');
	});
});
