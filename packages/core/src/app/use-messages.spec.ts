/**
 * What `app.use` reports when it is given what it does not take, read in
 * `tsc`'s own output: `test/messages/use`, a program of its own.
 */
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';

async function typecheck(name: string): Promise<string[]> {
	const dir = join(import.meta.dir, '..', '..', 'test', 'messages', name);
	const result = await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
		.cwd(import.meta.dir)
		.nothrow()
		.quiet();
	const output = result.stdout.toString() + result.stderr.toString();
	return output.split(/\n(?=\S)/).filter((error) => error.includes('TS2769'));
}

test('a middleware is reported on the middleware form, a plain function with the hint', async () => {
	const [missing, plain] = await typecheck('use');
	// The middleware forms are the last overloads: TypeScript 7 prints the last alone.
	const last = (error = '') =>
		error.split(/Overload \d+ of \d+|The last overload/).at(-1) ?? '';
	expect(last(missing)).toContain('ScopeMiddleware');
	expect(last(missing)).toContain("Property 'user' is missing");
	expect(last(plain)).toContain(
		"not assignable to type 'MadeByDefineMiddleware'",
	);
});
