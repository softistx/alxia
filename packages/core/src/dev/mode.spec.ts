/**
 * The dev switch: `alxia({ dev })` decides; else `NODE_ENV`, on unless it
 * is `production` or `test`.
 */
import { afterEach, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { devOf } from './mode';

const before = process.env['NODE_ENV'];
afterEach(() => {
	if (before === undefined) delete process.env['NODE_ENV'];
	else process.env['NODE_ENV'] = before;
});

test('NODE_ENV decides by default: off in production and under test', () => {
	for (const [env, dev] of [
		['production', false],
		['test', false],
		['development', true],
		['', true],
	] as const) {
		process.env['NODE_ENV'] = env;
		expect(devOf(undefined)).toBe(dev);
	}
	delete process.env['NODE_ENV'];
	expect(devOf(undefined)).toBe(true);
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

test('a bundle built without NODE_ENV still reads it when it runs', async () => {
	// `bun build` inlines `process.env.NODE_ENV`: the switch must not be
	// decided by the build's mode.
	const dir = `${import.meta.dir}/../../.bundle-probe`;
	const entry = `${dir}/entry.ts`;
	await Bun.write(
		entry,
		`import { devOf } from '${import.meta.dir}/mode';\nconsole.log(devOf(undefined));\n`,
	);
	try {
		const env = { ...process.env };
		delete env['NODE_ENV'];
		const built = Bun.spawnSync(
			[
				process.execPath,
				'build',
				entry,
				'--target=bun',
				'--minify',
				`--outdir=${dir}/dist`,
			],
			{ env },
		);
		expect(built.exitCode).toBe(0);
		const run = Bun.spawnSync([process.execPath, `${dir}/dist/entry.js`], {
			env: { ...env, NODE_ENV: 'production' },
		});
		expect(run.stdout.toString().trim()).toBe('false');
	} finally {
		await Bun.$`rm -rf ${dir}`.quiet();
	}
});
