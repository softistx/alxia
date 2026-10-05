/**
 * `compose(...middlewares)`: several middlewares as one, spliced into the
 * chain where it stands — in order, nested, a `validate` among them on a
 * route, refused by `use` — and typed for any number of them: what its
 * members read is checked where it is given, what they add passed on.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { compose } from './compose-middlewares';
import { defineMiddleware } from './define-middleware';
import { markFactory } from './factory';
import type { ContextOf } from './signatures';
import type { Empty } from './types';
import { validate } from './validate';

interface User {
	readonly id: string;
}

const order: string[] = [];
const step = (name: string) =>
	defineMiddleware<Empty>()((_ctx, next) => {
		order.push(name);
		return next();
	});
const auth = defineMiddleware<Empty>()((_ctx, next) =>
	next({ user: { id: 'ada' } as User }),
);
const named = defineMiddleware<{ user: User }>()(({ user }, next) =>
	next({ name: user.id.toUpperCase() }),
);
const id = z.object({ id: z.coerce.number() });

describe('compose at runtime', () => {
	test('its members run in order, nested ones in place, as if written there', async () => {
		order.length = 0;
		const inner = compose(step('b'), step('c'));
		const app = alxia()
			.use(compose(step('a'), inner))
			.get('/', compose(step('d'), step('e')), step('f'), ({ reply }) =>
				reply(200, order.join('')),
			);
		expect(await (await app.request('/')).text()).toBe('abcdef');
		expect(app.routes[0]?.derive).toHaveLength(6);
	});

	test('past 8 middlewares on one route', async () => {
		order.length = 0;
		const eight = compose(...'abcdefgh'.split('').map(step));
		const app = alxia().get('/', eight, step('i'), step('j'), ({ reply }) =>
			reply(200, order.join('')),
		);
		expect(await (await app.request('/')).text()).toBe('abcdefghij');
	});

	test('a validate among its members validates the route, where it stands', async () => {
		const app = alxia().get(
			'/todos/:id',
			compose(auth, validate({ params: id })),
			({ params, user, reply }) => reply(200, { id: params.id, by: user.id }),
		);
		expect(await (await app.request('/todos/7')).json()).toEqual({
			id: 7,
			by: 'ada',
		});
	});

	test('use() refuses a validate inside it, and it runs nowhere on its own', () => {
		expect(() =>
			alxia().use(
				// @ts-expect-error validate() and responds() belong to a route
				compose(auth, validate({ params: id })),
			),
		).toThrow(
			'use(): argument 1 (compose member 2) is a validate() or responds()',
		);
		const audit = () => step('audit');
		markFactory(audit);
		expect(() =>
			alxia().get(
				'/',
				step('a'),
				(compose as (...m: unknown[]) => never)(auth, audit),
				({ reply }) => reply(200, 'ok'),
			),
		).toThrow(
			'GET /: middleware 2 (compose member 2) looks like a factory (audit)',
		);
		const alone = compose(auth) as unknown as () => unknown;
		expect(() => alone()).toThrow('compose() runs among a route');
		expect(() => (compose as (...args: unknown[]) => unknown)()).toThrow(
			'compose(): no middleware is given',
		);
		expect(() => compose('auth' as never)).toThrow(
			'compose(): argument 1 is not a function',
		);
	});
});

describe('the types of compose', () => {
	test('what its members add is passed on, each reading what the ones before added', () => {
		const app = alxia().use(
			compose(auth, named, (_ctx, next) => next({ n: 1 })),
		);
		expectTypeOf<ContextOf<typeof app>['user']>().toEqualTypeOf<User>();
		expectTypeOf<ContextOf<typeof app>['name']>().toEqualTypeOf<string>();
		expectTypeOf<ContextOf<typeof app>['n']>().toEqualTypeOf<number>();
	});

	test('what a member reads and no member before it adds is required where compose stands', () => {
		const needsUser = compose(named, step('x'));
		alxia().use(auth).use(needsUser);
		// @ts-expect-error `user` is missing from the context
		alxia().use(needsUser);
		const app = alxia().use(auth);
		app.get('/', needsUser, ({ name, reply }) => reply(200, name));
	});

	test('typed for any number of members', () => {
		const m = step('m');
		const twelve = compose(m, m, m, m, m, m, m, m, m, m, m, auth);
		const app = alxia().use(twelve);
		expectTypeOf<ContextOf<typeof app>['user']>().toEqualTypeOf<User>();
	});

	test("a validate's output reaches the handler", () => {
		alxia().get(
			'/todos/:id',
			compose(validate({ params: id })),
			({ params, reply }) => {
				expectTypeOf(params.id).toEqualTypeOf<number>();
				return reply(200, params.id);
			},
		);
	});
});
