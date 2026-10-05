import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { main } from './main';

const cwd = join(import.meta.dir, '..', '..');

async function run(...args: string[]) {
	const out: string[] = [];
	const err: string[] = [];
	const code = await main(args, cwd, {
		out: (line) => out.push(line),
		err: (line) => err.push(line),
	});
	return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('alxia-env example', () => {
	test('prints the .env.example of the module, though its env is invalid', async () => {
		const { code, out } = await run('example', 'test/cli/env.ts');
		expect(code).toBe(0);
		expect(out).toBe(`# Where the data lives
# string (url), required
DATABASE_URL=

# number, optional, default 3000
PORT=3000`);
	});

	test('says what is wrong', async () => {
		expect((await run('example', 'test/cli/missing.ts')).code).toBe(1);
		expect((await run('example', 'package.json')).err).toContain(
			'ran no defineEnv() call',
		);
		expect((await run('nope')).code).toBe(1);
		expect((await run()).err).toContain('usage: alxia-env example');
	});
});
