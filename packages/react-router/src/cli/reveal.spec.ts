import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { BROWSER, copyFixture } from '../../test/fixture';
import { build, start } from '../../test/vite';
import { main, USAGE } from './main';
import { SERVER_FILE } from './template';

/** `main` in `root`, with what it printed. */
async function run(root: string, ...args: string[]) {
	const out: string[] = [];
	const err: string[] = [];
	const code = await main(args, root, {
		out: (line) => out.push(line),
		err: (line) => err.push(line),
	});
	return { code, out: out.join('\n'), err: err.join('\n') };
}

const WROTE = (file: string) =>
	`alxia-react-router: wrote ${file}, the server alxia() runs by default.\nNext: uncomment configure in ${file} to add the app's middlewares and /api; bun run dev picks it up.`;

describe('alxia-react-router reveal', () => {
	let root: string;
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'alxia-reveal-'));
		await Bun.write(
			join(root, 'vite.config.ts'),
			"import { alxia } from '@alxia/react-router/vite';\nexport default { plugins: [alxia()] };\n",
		);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('writes app/server.ts, and says what it wrote and what comes next', async () => {
		expect(await run(root, 'reveal')).toEqual({
			code: 0,
			out: WROTE('app/server.ts'),
			err: '',
		});
		expect(await Bun.file(join(root, 'app', 'server.ts')).text()).toBe(
			SERVER_FILE,
		);
	});

	test('refuses to overwrite a server file, and leaves it as it was', async () => {
		const file = join(root, 'app', 'server.ts');
		await Bun.write(file, '// mine\n');
		expect(await run(root, 'reveal')).toEqual({
			code: 1,
			out: '',
			err: 'alxia-react-router: app/server.ts already exists, and reveal leaves it as it is. Run alxia-react-router reveal --force to overwrite it.',
		});
		expect(await Bun.file(file).text()).toBe('// mine\n');
	});

	test('--force overwrites it', async () => {
		const file = join(root, 'app', 'server.ts');
		await Bun.write(file, '// mine\n');
		expect((await run(root, 'reveal', '--force')).code).toBe(0);
		expect(await Bun.file(file).text()).toBe(SERVER_FILE);
	});

	test("writes to alxia({ entry })'s file when vite.config.ts names one", async () => {
		await Bun.write(
			join(root, 'vite.config.ts'),
			'import { alxia } from \'@alxia/react-router/vite\';\nexport default {\n\tplugins: [\n\t\talxia({\n\t\t\tentry: "server/main.ts",\n\t\t}),\n\t],\n};\n',
		);
		expect((await run(root, 'reveal')).out).toBe(WROTE('server/main.ts'));
		expect(await Bun.file(join(root, 'server', 'main.ts')).exists()).toBe(true);
	});

	test("writes into React Router's appDirectory when its config names one", async () => {
		await Bun.write(
			join(root, 'react-router.config.ts'),
			"export default { ssr: true, appDirectory: 'src' };\n",
		);
		expect((await run(root, 'reveal')).out).toBe(WROTE('src/server.ts'));
	});

	test('reads past comments: a commented entry or appDirectory is not the one', async () => {
		await Bun.write(
			join(root, 'vite.config.ts'),
			"import { alxia } from '@alxia/react-router/vite';\n// alxia({ entry: 'old/server.ts' })\nexport default { plugins: [alxia()] };\n",
		);
		await Bun.write(
			join(root, 'react-router.config.ts'),
			"export default {\n\t/* appDirectory: 'src', */\n\tssr: true,\n};\n",
		);
		expect((await run(root, 'reveal')).out).toBe(WROTE('app/server.ts'));
	});

	test('refuses an entry or an appDirectory it cannot read, writing nothing', async () => {
		await Bun.write(
			join(root, 'vite.config.ts'),
			"import { alxia } from '@alxia/react-router/vite';\nconst SERVER = 'server/main.ts';\nexport default { plugins: [alxia({ entry: SERVER })] };\n",
		);
		expect(await run(root, 'reveal')).toEqual({
			code: 1,
			out: '',
			err: "alxia-react-router: vite.config.ts gives alxia() an entry reveal cannot read. Write it as a string literal, alxia({ entry: 'app/server.ts' }), and run reveal again.",
		});
		await Bun.write(
			join(root, 'vite.config.ts'),
			"import { alxia } from '@alxia/react-router/vite';\nexport default { plugins: [alxia()] };\n",
		);
		await Bun.write(
			join(root, 'react-router.config.ts'),
			"export default { appDirectory: process.env.APP ?? 'app' };\n",
		);
		expect(await run(root, 'reveal')).toEqual({
			code: 1,
			out: '',
			err: "alxia-react-router: react-router.config.ts computes appDirectory, which reveal cannot read. Write it as a string literal, appDirectory: 'app', and run reveal again.",
		});
		expect(await Bun.file(join(root, 'app', 'server.ts')).exists()).toBe(false);
	});

	test('refuses to run outside an app, with no vite.config.ts', async () => {
		const elsewhere = join(root, 'elsewhere');
		await mkdir(elsewhere);
		expect(await run(elsewhere, 'reveal')).toEqual({
			code: 1,
			out: '',
			err: `alxia-react-router: no vite.config.ts in ${elsewhere}. Run reveal from the app's root, beside vite.config.ts.`,
		});
	});

	test('--help prints the usage; an unknown command or option is refused with it', async () => {
		expect(await run(root, '--help')).toEqual({ code: 0, out: USAGE, err: '' });
		expect(await run(root)).toEqual({ code: 1, out: '', err: USAGE });
		expect(await run(root, 'hide')).toEqual({
			code: 1,
			out: '',
			err: `alxia-react-router: unknown command hide.\n\n${USAGE}`,
		});
		expect(await run(root, 'reveal', '--folder')).toEqual({
			code: 1,
			out: '',
			err: `alxia-react-router: unknown option --folder for reveal.\n\n${USAGE}`,
		});
		expect(await Bun.file(join(root, 'app', 'server.ts')).exists()).toBe(false);
	});

	test('the built bin runs as a file, under Bun from its #! line', async () => {
		const bin = join(import.meta.dir, '..', '..', 'dist', 'cli', 'index.js');
		expect((await Bun.file(bin).text()).split('\n')[0]).toBe(
			'#!/usr/bin/env bun',
		);
		const ran = await $`${bin} reveal`.cwd(root).quiet().nothrow();
		expect(ran.exitCode).toBe(0);
		expect(ran.stdout.toString()).toBe(`${WROTE('app/server.ts')}\n`);
		const again = await $`${bin} reveal`.cwd(root).quiet().nothrow();
		expect(again.exitCode).toBe(1);
	});
});

/** The commented options of the revealed file, uncommented. */
function uncommented(source: string): string {
	return source
		.replace('// import { userAgentContext }', 'import { userAgentContext }')
		.replace(/^\t\/\/ (beforeAll|configure|getLoadContext|\t|\})/gm, '\t$1');
}

describe('the revealed file, in a React Router app', () => {
	test('typechecks as written, and with every option uncommented', async () => {
		const fixture = await copyFixture({ server: false });
		try {
			expect((await run(fixture.root, 'reveal', '--force')).code).toBe(0);
			const file = join(fixture.root, 'app', 'server.ts');
			// The server alone: the fixture's routes read keys its own server derives.
			const tsconfig = join(fixture.root, 'tsconfig.reveal.json');
			await Bun.write(
				tsconfig,
				JSON.stringify({
					extends: './tsconfig.json',
					include: ['app/server.ts', 'app/context.ts'],
				}),
			);
			const tsc = () =>
				$`${process.execPath} --bun x tsc --noEmit -p ${tsconfig}`
					.cwd(fixture.root)
					.quiet()
					.nothrow();
			const written = await tsc();
			expect(written.stdout.toString()).toBe('');
			expect(written.exitCode).toBe(0);

			await Bun.write(file, uncommented(SERVER_FILE));
			await Bun.write(
				join(fixture.root, 'app', 'context.ts'),
				"import { createContext } from 'react-router';\nexport const userAgentContext = createContext<string | null>(null);\n",
			);
			expect(await Bun.file(file).text()).not.toContain('// configure');
			const edited = await tsc();
			expect(edited.stdout.toString()).toBe('');
			expect(edited.exitCode).toBe(0);
		} finally {
			await fixture.remove();
		}
	}, 60_000);

	test('serves the same answers as the default server', async () => {
		const fixture = await copyFixture({ server: false });
		/** What the built server answers on a few paths: a page, /api, assets, a 404. */
		const answers = async (who: string) => {
			const { child, url } = await start(fixture.root, who);
			try {
				const page = await fetch(url, {
					headers: { 'user-agent': BROWSER, 'x-user': 'Ada' },
				});
				const html = await page.text();
				const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
				const paths = [asset ?? '/no-asset', '/robots.txt', '/api/health'];
				const others = await Promise.all(
					paths.map(async (path) => {
						const response = await fetch(new URL(path, url));
						return {
							path,
							status: response.status,
							type: response.headers.get('content-type'),
							cache: response.headers.get('cache-control'),
							body: await response.text(),
						};
					}),
				);
				return { status: page.status, html, others };
			} finally {
				child.kill();
			}
		};
		try {
			await build(fixture.root);
			const before = await answers('alxia');
			expect(before.html.replaceAll('<!-- -->', '')).toContain(
				'<h1>Hello anonymous</h1>',
			);
			expect((await run(fixture.root, 'reveal')).code).toBe(0);
			await build(fixture.root);
			expect(await answers('alxia')).toEqual(before);
		} finally {
			await fixture.remove();
		}
	}, 60_000);
});
