import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';

test('app.decorate({ env }): ctx.env is typed in every route and middleware', async () => {
	const dir = join(import.meta.dir, '..', 'test', 'register', 'env');
	const result = await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
		.nothrow()
		.quiet();
	expect(result.stdout.toString() + result.stderr.toString()).toBe('');
	expect(result.exitCode).toBe(0);
}, 60_000);
