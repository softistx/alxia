/**
 * What a middleware form reports when the context in force does not give
 * what a middleware reads, read in `tsc`'s own output:
 * `test/messages/context`, a program of its own. Each mistake is one
 * error on the middleware itself — not "No overload matches this call" —
 * whose last line names the key, on TypeScript 6 as on 7. And
 * `test/messages/limits`: a ninth middleware, a `validate` or a `responds`
 * given to `use`, a factory given uncalled, each told why.
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
	return output.split(/\n(?=\S)/).filter((error) => error.includes(' TS'));
}

const missing =
	'"`user` is missing from the context: add a middleware that gives it before this one"';

test('each mistake is one error on the middleware, naming what is missing', async () => {
	const errors = await typecheck('context');
	expect(errors).toHaveLength(6);
	for (const error of errors) {
		expect(error).toContain('error TS2345');
		expect(error).not.toContain('No overload matches');
	}
	const [use, route, after, options, socket, path] = errors;
	for (const error of [use, route, options, socket]) {
		expect(error).toContain(missing);
	}
	expect(after).toContain(
		'"`user` is in the context with another type than this middleware reads"',
	);
	expect(path).toContain(
		`"the path parameter \`id\` is not in this route's path"`,
	);
});

const tooMany =
	'"at most 8 middlewares per route: group them with compose(...)"';
const builtin =
	'"validate() and responds() belong to a route: give them among its middlewares, not to use()"';
const factory =
	'"this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"';

test('a ninth middleware, a validate() given to use(), an uncalled factory: one error each, naming it', async () => {
	const errors = await typecheck('limits');
	expect(errors).toHaveLength(9);
	for (const error of errors) {
		expect(error).toContain('error TS2345');
		expect(error).not.toContain('No overload matches');
	}
	const [route, options, socket, validated, responded, used, given, ...rest] =
		errors;
	for (const error of [route, options, socket, ...rest])
		expect(error).toContain(tooMany);
	for (const error of [validated, responded]) expect(error).toContain(builtin);
	for (const error of [used, given]) expect(error).toContain(factory);
});
