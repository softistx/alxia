import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { AnyReply, Reply } from '../reply/reply';
import { type Alxia, alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { definePlugin } from './define-plugin';
import type { ContextOf } from './signatures';
import type { AddingNothing } from './use-forms';
import { validate } from './validate';

interface User {
	readonly id: string;
}

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } as User });
});
const guard = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin')
		? next()
		: reply(401, { error: 'admins only' as const }),
);
const tenant = defineMiddleware<{ user: User }>()(({ user }, next) =>
	next({ tenant: user.id.slice(0, 2) }),
);

describe('the types of app.use(...middlewares)', () => {
	test('what they add is typed on the routes after them, not before', () => {
		alxia()
			// @ts-expect-error no `user` before use(auth)
			.get('/before', ({ user, reply }) => reply(200, user.id))
			.use(auth)
			.get('/after', ({ user, reply }) => {
				expectTypeOf(user).toEqualTypeOf<User>();
				return reply(200, user.id);
			});
	});

	test('each reads what the ones before it added, up to 8', () => {
		const add = defineMiddleware((_ctx, next) => next({ x: 1 }));
		const app = alxia().use(auth, tenant, add, add, add, add, add, add);
		expectTypeOf<ContextOf<typeof app>['tenant']>().toEqualTypeOf<string>();
		// @ts-expect-error tenant reads a `user` no middleware before it adds
		alxia().use(tenant, auth);
		// @ts-expect-error use takes at most 8 middlewares at once
		alxia().use(add, add, add, add, add, add, add, add, add);
	});

	test('their replies join the app’s shortcuts', () => {
		const app = alxia().use(auth);
		type Shortcut =
			typeof app extends Alxia<object, string, infer S extends AnyReply>
				? S
				: never;
		expectTypeOf<Shortcut>().toEqualTypeOf<
			Reply<401, { readonly error: 'unauthorized' }>
		>();
	});

	test('a group’s stay inside it', () => {
		alxia()
			.group('/me', (me) =>
				me.use(auth).get('/', ({ user, reply }) => reply(200, user.id)),
			)
			// @ts-expect-error the group's `user` stays inside it
			.get('/', ({ user, reply }) => reply(200, user.id));
	});

	test('only a function made by defineMiddleware is a middleware', () => {
		expect(() =>
			// @ts-expect-error a plain (ctx, next) function is read as a plugin
			alxia().use((_ctx: object, next: () => Promise<Response>) => next()),
		).toThrow(TypeError);
		expect(() =>
			// @ts-expect-error validate() belongs to a route
			alxia().use(validate({})),
		).toThrow(/validate\(\) or responds\(\), which belongs to a route/);
	});

	test('a plugin is still a plugin', () => {
		const plugin = definePlugin()((app) => app.decorate({ db: 1 as const }));
		const app = alxia().plugin(plugin).use(auth);
		expectTypeOf<ContextOf<typeof app>['db']>().toEqualTypeOf<1>();
		expectTypeOf<ContextOf<typeof app>['user']>().toEqualTypeOf<User>();
	});
});

describe('the types of app.use(path, ...middlewares)', () => {
	test('takes a middleware that adds nothing, and the app is unchanged', () => {
		const app = alxia().use('/admin', guard, guard);
		expectTypeOf<ContextOf<typeof app>>().toEqualTypeOf<
			ContextOf<ReturnType<typeof alxia>>
		>();
	});

	test('refuses one that adds to the context, saying why', () => {
		// @ts-expect-error a middleware given a path may add nothing
		alxia().use('/admin', auth);
		// @ts-expect-error the second adds
		alxia().use('/admin', guard, auth);
		expectTypeOf<
			AddingNothing<[typeof auth]>[0]
		>().toEqualTypeOf<'Invalid middleware: a middleware given a path may add nothing to the context, and this one passes "user" to next(): give it to the routes of a group instead, app.group(path, (group) => group.use(middleware))'>();
	});

	test('refuses a path a route could not be declared at', () => {
		expect(() =>
			// @ts-expect-error "*" may only end a path
			alxia().use('/a/*/b', guard),
		).toThrow(TypeError);
		expect(() =>
			// @ts-expect-error a trailing "/" would match no route
			alxia().use('/admin/', guard),
		).toThrow(TypeError);
		alxia().use('/', guard);
	});

	test('reads the context in force: an adding middleware goes in a group', () => {
		const ownTenant = defineMiddleware<{ user: User }>()(
			({ user, reply }, next) =>
				user.id === 'root' ? next() : reply(403, { error: 'no' as const }),
		);
		alxia().use(auth).use('/t', ownTenant);
		// @ts-expect-error no `user` in force for ownTenant
		alxia().use('/t', ownTenant);
		alxia().group('/t', (t) =>
			t.use(auth, tenant).get('/', ({ tenant, reply }) => reply(200, tenant)),
		);
	});
});
