import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeRegistry, writeScaffold } from '../test/scaffold';
import { type Io, main, packageName, USAGE } from './main';
import { BUNFIG } from './templates/react-router';
import { alxiaRanges } from './versions';

const VERSIONS = {
	zod: ['4.2.0', '4.6.5'],
	typescript: ['6.0.3', '7.0.2'],
	'@types/bun': ['1.4.2'],
	'react-router': ['8.4.0'],
	'@react-router/node': ['8.4.0'],
	'@react-router/serve': ['8.4.0'],
	'@react-router/dev': ['8.4.0'],
	isbot: ['5.2.2'],
	react: ['19.3.0'],
	'react-dom': ['19.3.0'],
	'@tailwindcss/vite': ['4.3.3'],
	tailwindcss: ['4.3.3'],
	'@types/node': ['26.6.4'],
	'@types/react': ['19.3.0'],
	'@types/react-dom': ['19.3.0'],
	vite: ['8.3.2'],
};

interface Fake {
	readonly io: Io;
	readonly out: string[];
	readonly err: string[];
	readonly ran: { command: readonly string[]; cwd: string }[];
}

let root: string;
let registry: ReturnType<typeof fakeRegistry>;
const roots: string[] = [];
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'alxia-create-main-'));
	roots.push(root);
	registry = fakeRegistry(VERSIONS);
});
afterEach(() => registry.stop());
afterAll(async () => {
	for (const dir of roots) await rm(dir, { recursive: true, force: true });
});

/**
 * An `Io` that answers `answers` in turn (null: no terminal), runs nothing
 * but records each command — `create-react-router` writes `scaffold` — and
 * exits each with `codes[command]`, 0 by default.
 */
function fake(
	options: {
		answers?: (string | null)[];
		scaffold?: Parameters<typeof writeScaffold>[1] | 'none';
		codes?: { install?: number; scaffold?: number };
		registryUrl?: string;
	} = {},
): Fake {
	const out: string[] = [];
	const err: string[] = [];
	const ran: Fake['ran'] = [];
	const answers = [...(options.answers ?? [])];
	return {
		out,
		err,
		ran,
		io: {
			out: (line) => out.push(line),
			err: (line) => err.push(line),
			// No answers left: no terminal.
			ask: () => (answers.length > 0 ? answers.shift() : undefined),
			run: async (command, cwd) => {
				ran.push({ command, cwd });
				if (command[1] === 'install') return options.codes?.install ?? 0;
				if (options.scaffold !== 'none') {
					await writeScaffold(
						join(cwd, command[3] as string),
						options.scaffold,
					);
				}
				return options.codes?.scaffold ?? 0;
			},
			env: { BUN_CONFIG_REGISTRY: options.registryUrl ?? registry.url },
		},
	};
}

const json = (file: string) => Bun.file(file).json();

describe('create-alxia', () => {
	test('--help prints the usage', async () => {
		const { io, out } = fake();
		expect(await main(['--help'], root, io)).toBe(0);
		expect(out).toEqual([USAGE]);
	});

	test('refuses an argument it does not know, with the usage', async () => {
		const { io, err } = fake();
		expect(await main(['app', '--template', 'vue'], root, io)).toBe(1);
		expect(err).toEqual([
			`create-alxia: unknown template vue: use api or react-router.\n\n${USAGE}`,
		]);
	});

	test('with no terminal, refuses to guess a directory or a template', async () => {
		const first = fake();
		expect(await main([], root, first.io)).toBe(1);
		expect(first.err[0]).toStartWith(
			'create-alxia: no directory given, and no terminal to ask in.',
		);
		const second = fake();
		expect(await main(['app'], root, second.io)).toBe(1);
		expect(second.err[0]).toStartWith(
			'create-alxia: no --template given, and no terminal to ask in.',
		);
	});

	test('with no arguments, asks the directory, then the template, then installs', async () => {
		const { io, out, ran } = fake({ answers: ['my-api', 'api'] });
		expect(await main([], root, io)).toBe(0);
		const dir = join(root, 'my-api');
		expect((await readdir(dir)).sort()).toEqual([
			'.gitignore',
			'README.md',
			'package.json',
			'src',
			'tsconfig.json',
		]);
		expect(ran).toEqual([{ command: [process.execPath, 'install'], cwd: dir }]);
		expect(out.at(-1)).toBe(
			'\nDone: my-api holds the api template. Next:\n\n  cd my-api\n  bun dev\n',
		);
	});

	test('input ended at a question (Ctrl-D): cancelled, nothing written', async () => {
		for (const answers of [[null], ['my-api', null]]) {
			const { io, err } = fake({ answers });
			expect(await main([], root, io)).toBe(1);
			expect(err).toEqual(['create-alxia: cancelled, nothing written.']);
			expect(await readdir(root)).toEqual([]);
		}
	});

	test('an unknown template answered is refused', async () => {
		const { io, err } = fake({ answers: ['my-api', 'vue'] });
		expect(await main([], root, io)).toBe(1);
		expect(err[0]).toStartWith(
			'create-alxia: unknown template vue: use api or react-router.',
		);
	});

	test("api: the manifest at alxia's versions, the rest at the registry's newest", async () => {
		const { io, out, ran } = fake();
		expect(
			await main(['my-api', '--template', 'api', '--no-install'], root, io),
		).toBe(0);
		const alxia = await alxiaRanges();
		expect(await json(join(root, 'my-api', 'package.json'))).toMatchObject({
			name: 'my-api',
			dependencies: { '@alxia/core': alxia['@alxia/core'], zod: '^4.6.5' },
			devDependencies: {
				'@alxia/client': alxia['@alxia/client'],
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
		const dir = join(root, 'taken');
		await Bun.write(join(dir, 'notes.txt'), 'mine');
		const { io, err } = fake();
		expect(await main(['taken', '--template', 'api'], root, io)).toBe(1);
		expect(err).toEqual([
			'create-alxia: taken is not empty (notes.txt), and create-alxia writes only into an empty directory. Choose another directory, or empty this one.',
		]);
		expect(await readdir(dir)).toEqual(['notes.txt']);
	});

	test('writes into an empty directory it is run in, with no cd to take', async () => {
		const dir = join(root, 'here');
		await mkdir(dir);
		const { io, out } = fake();
		expect(await main(['.', '--template', 'api'], dir, io)).toBe(0);
		expect((await json(join(dir, 'package.json'))).name).toBe('here');
		expect(out.at(-1)).toBe(
			'\nDone: this directory holds the api template. Next:\n\n  bun dev\n',
		);
	});

	test('react-router: the official scaffold, then alxia added to it', async () => {
		const { io, ran } = fake();
		expect(await main(['web', '--template', 'react-router'], root, io)).toBe(0);
		expect(ran[0]?.command.slice(1, 4)).toEqual([
			'x',
			'create-react-router@8',
			'web',
		]);
		expect(ran[0]?.cwd).toBe(root);
		const dir = join(root, 'web');
		const manifest = await json(join(dir, 'package.json'));
		const alxia = await alxiaRanges();
		expect(manifest.scripts.start).toBe('bun build/server/index.js');
		expect(manifest.dependencies).toEqual({
			'@alxia/core': alxia['@alxia/core'],
			'@alxia/react-router': alxia['@alxia/react-router'],
			'@react-router/node': '^8.4.0',
			'@react-router/serve': '^8.4.0',
			isbot: '^5.2.2',
			react: '^19.3.0',
			'react-dom': '^19.3.0',
			'react-router': '^8.4.0',
		});
		expect(manifest.devDependencies.typescript).toBe('^7.0.2');
		expect(await Bun.file(join(dir, 'vite.config.ts')).text()).toContain(
			'plugins: [tailwindcss(), reactRouter(), alxia()]',
		);
		expect(await Bun.file(join(dir, 'bunfig.toml')).text()).toBe(BUNFIG);
		expect(ran[1]?.command).toEqual([process.execPath, 'install']);
	});

	test('a scaffold it does not know: refused, and nothing left behind', async () => {
		const { io, err, ran } = fake({
			scaffold: { viteConfig: 'export default {};\n' },
		});
		expect(await main(['web', '--template', 'react-router'], root, io)).toBe(1);
		expect(err[0]).toStartWith(
			"create-alxia: create-react-router's vite.config.ts is not what this @alxia/create expects",
		);
		expect(await readdir(root)).toEqual([]);
		expect(ran).toHaveLength(1);
	});

	test('a scaffold it does not know, in an empty directory that was there: emptied, kept', async () => {
		await mkdir(join(root, 'web'));
		const { io } = fake({ scaffold: { viteConfig: 'export default {};\n' } });
		expect(await main(['web', '--template', 'react-router'], root, io)).toBe(1);
		expect(await readdir(join(root, 'web'))).toEqual([]);
	});

	test('create-react-router failing fails the command', async () => {
		const { io, err } = fake({ scaffold: 'none', codes: { scaffold: 2 } });
		expect(await main(['web', '--template', 'react-router'], root, io)).toBe(1);
		expect(err).toEqual([
			'create-alxia: failed: create-react-router exited with 2.',
		]);
		expect(await readdir(root)).toEqual([]);
	});

	test('a registry that does not answer: the template versions kept, with a warning', async () => {
		const { io, err } = fake({ registryUrl: 'http://localhost:1' });
		expect(
			await main(['my-api', '--template', 'api', '--no-install'], root, io),
		).toBe(0);
		expect(err[0]).toBe(
			'create-alxia: warning: the registry did not answer for zod, @types/bun, typescript; kept the versions the template ships.',
		);
		expect(
			(await json(join(root, 'my-api', 'package.json'))).devDependencies
				.typescript,
		).toBe('^6.0.3');
	});

	test('bun install failing: exit 1, the files kept, and bun install among the next steps', async () => {
		const { io, err, out } = fake({ codes: { install: 1 } });
		expect(await main(['my-api', '--template', 'api'], root, io)).toBe(1);
		expect(err).toEqual([
			'create-alxia: bun install failed; the files are written.',
		]);
		expect(out.at(-1)).toContain('  cd my-api\n  bun install\n  bun dev');
		expect(await Bun.file(join(root, 'my-api', 'package.json')).exists()).toBe(
			true,
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
