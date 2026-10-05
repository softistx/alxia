/**
 * The dev switch: `alxia({ dev })` decides; else `NODE_ENV`, on only when
 * it is exactly `development`: fail closed.
 */
import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from '../app/alxia';
import { isDev } from '../app/served';
import { devOf } from './mode';

const before = process.env['NODE_ENV'];
afterEach(() => {
	if (before === undefined) delete process.env['NODE_ENV'];
	else process.env['NODE_ENV'] = before;
});

test('NODE_ENV decides by default: on in development alone, fail closed', () => {
	for (const [env, dev] of [
		['development', true],
		['production', false],
		['test', false],
		['staging', false],
		['prod', false],
		['Production', false],
		['Development', false],
		['', false],
	] as const) {
		process.env['NODE_ENV'] = env;
		expect(devOf(undefined)).toBe(dev);
	}
	delete process.env['NODE_ENV'];
	expect(devOf(undefined)).toBe(false);
});

test('the option wins over NODE_ENV, either way', () => {
	process.env['NODE_ENV'] = 'production';
	expect(devOf(true)).toBe(true);
	process.env['NODE_ENV'] = 'development';
	expect(devOf(false)).toBe(false);
});

test('read when the app is made, and anything but a boolean throws', async () => {
	process.env['NODE_ENV'] = 'development';
	const app = alxia().get('/todos', ({ reply }) => reply(200, []));
	process.env['NODE_ENV'] = 'production';
	expect((await (await app.request('/todo')).json()).hint).toBe(
		'did you mean GET /todos?',
	);
	expect(() => alxia({ dev: 'yes' as never })).toThrow(
		'alxia(): dev must be true or false, not "yes"',
	);
});

/** Builds `devOf(undefined)` into `dir` with `NODE_ENV=development`, then runs it under each `NODE_ENV`. */
function devOfBuilt(
	dir: string,
	compile: boolean,
	modes: readonly (string | undefined)[],
): string[] {
	const entry = `${dir}/entry.ts`;
	const out = `${dir}/${compile ? 'app' : 'dist/entry.js'}`;
	const target = compile
		? ['--compile', `--outfile=${out}`]
		: [`--outfile=${out}`];
	const env = { ...process.env };
	delete env['NODE_ENV'];
	const built = Bun.spawnSync(
		[process.execPath, 'build', entry, '--target=bun', '--minify', ...target],
		{ env: { ...env, NODE_ENV: 'development' } },
	);
	expect(built.exitCode).toBe(0);
	return modes.map((mode) => {
		const run = Bun.spawnSync(compile ? [out] : [process.execPath, out], {
			env: mode === undefined ? env : { ...env, NODE_ENV: mode },
		});
		return run.stdout.toString().trim();
	});
}

test('a bundle and a compiled binary read NODE_ENV when they run, not when built', async () => {
	// `bun build` inlines `process.env.NODE_ENV`: the switch must not be
	// decided by the build's mode.
	const dir = mkdtempSync(join(tmpdir(), 'alxia-dev-bundle-'));
	await Bun.write(
		`${dir}/entry.ts`,
		`import { devOf } from '${import.meta.dir}/mode';\nconsole.log(devOf(undefined));\n`,
	);
	try {
		const modes = [undefined, 'production', 'staging', 'development'];
		const expected = ['false', 'false', 'false', 'true'];
		expect(devOfBuilt(dir, false, modes)).toEqual(expected);
		expect(devOfBuilt(dir, true, modes)).toEqual(expected);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("isDev(ctx) reads the serving app's switch, a plugin's route included", async () => {
	const routes = alxia().get('/dev', (ctx) =>
		ctx.reply(200, String(isDev(ctx))),
	);
	for (const dev of [true, false]) {
		const app = alxia({ dev }).plugin(routes);
		expect(await (await app.request('/dev')).text()).toBe(String(dev));
	}
	expect(isDev({})).toBe(false);
});
