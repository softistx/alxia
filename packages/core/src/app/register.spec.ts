import { describe, expect, expectTypeOf, test } from 'bun:test';
import { join } from 'node:path';
import { $ } from 'bun';
import { type Alxia, alxia, type ContextOf } from './alxia';
import { defineRoutes } from './define-plugin';
import type {
	AppContext,
	InvalidRegister,
	RegisteredBase,
	RegisteredOf,
} from './register';
import type { BaseContext, Empty } from './types';

/**
 * `test/register/<name>`, a program of its own, through the workspace's
 * tsc: `Register` is augmented there, never in this package's typecheck,
 * whose specs read it unregistered.
 */
async function typecheck(name: string): Promise<string> {
	const dir = join(import.meta.dir, '..', '..', 'test', 'register', name);
	const result = await $`${process.execPath} --bun tsc --noEmit -p ${dir}`
		.cwd(import.meta.dir)
		.nothrow()
		.quiet();
	return result.stdout.toString() + result.stderr.toString();
}

describe('Register, unregistered', () => {
	test('AppContext is the base context, defineRoutes requires nothing', async () => {
		expectTypeOf<AppContext>().toEqualTypeOf<BaseContext & Empty>();
		expectTypeOf<RegisteredBase>().toEqualTypeOf<Alxia<Empty, ''>>();
		const routes = defineRoutes('/todos').get('/', ({ route, reply }) =>
			reply(200, route),
		);
		const app = alxia({ prefix: '/api' }).plugin(routes);
		expect(await (await app.request('/api/todos')).text()).toBe('/api/todos');
		expect(app.routes.map(({ path }) => path)).toEqual(['/api/todos']);
	});

	test('defineRoutes() takes no prefix', async () => {
		const app = alxia().plugin(
			defineRoutes().get('/', ({ reply }) => reply(200, 'root')),
		);
		expect(await (await app.request('/')).text()).toBe('root');
	});

	test('RegisteredOf: an app, a fresh one, or InvalidRegister', () => {
		const base = alxia().derive(() => ({ user: 'ada' }));
		expectTypeOf<RegisteredOf<{ context: typeof base }>>().toEqualTypeOf<
			typeof base
		>();
		expectTypeOf<RegisteredOf<object>>().toEqualTypeOf<Alxia<Empty, ''>>();
		expectTypeOf<
			RegisteredOf<{ context: ContextOf<typeof base> }>
		>().toEqualTypeOf<InvalidRegister>();
	});
});

describe('Register, augmented', () => {
	test('a route file reads the registered context with no import of the app; mounting it early is refused', async () => {
		// Every refusal there is a @ts-expect-error: no output is each one failing.
		expect(await typecheck('split')).toBe('');
	}, 30_000);

	test('defineMiddleware(fn) reads the registered context; the base says Empty for its own', async () => {
		// Every refusal there is a @ts-expect-error: no output is each one failing.
		expect(await typecheck('middleware')).toBe('');
	}, 30_000);

	test('registering the app that mounts the routes is a cycle', async () => {
		const output = await typecheck('cycle');
		expect(output).toContain(
			"app.ts(6,14): error TS7022: 'app' implicitly has type 'any'",
		);
		expect(output).toContain(
			"todos.ts(3,14): error TS7022: 'todos' implicitly has type 'any'",
		);
	}, 30_000);

	test('a value that is not an app reads as InvalidRegister', async () => {
		const output = await typecheck('invalid');
		expect(output).toContain(
			"error TS2339: Property 'user' does not exist on type 'BaseContext & { readonly 'Register.context must be typeof base, the alxia() chain that decorates and derives the context': never; }'",
		);
		expect(output.match(/error TS2339/g)).toHaveLength(2);
	}, 30_000);

	test('two registrations conflict', async () => {
		const output = await typecheck('twice');
		expect(output).toContain(
			"error TS2717: Subsequent property declarations must have the same type.  Property 'context' must be of type",
		);
	}, 30_000);
});
