import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	test,
} from 'bun:test';
import { alxia, type ContextOf, type Plugin } from './alxia';
import { defineMiddleware } from './define-middleware';
import { definePlugin, defineRoutes } from './define-plugin';
import { validate } from './validate';

interface User {
	readonly id: string;
}

/** Adds a `user`, or ends the request with a 401. */
const session = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthenticated' as const });
	return { user: { id } satisfies User };
});

const ada = { headers: { 'x-user': 'ada' } };

describe('app.plugin(plugin)', () => {
	test('mounts an app: its routes behind this one, its context for the routes after it', async () => {
		const routes = alxia().get('/ping', ({ reply }) => reply(200, 'pong'));
		const app = alxia({ prefix: '/api' })
			.plugin(session)
			.plugin(routes)
			.get('/me', ({ user, reply }) => reply(200, user.id));
		expectTypeOf<ContextOf<typeof app>['user']['id']>().toEqualTypeOf<string>();
		expect((await app.request('/api/ping')).status).toBe(401);
		expect(await (await app.request('/api/ping', ada)).text()).toBe('pong');
		expect(await (await app.request('/api/me', ada)).text()).toBe('ada');
	});

	test('mounts a plugin of definePlugin, and the routes of defineRoutes, checking what they read', async () => {
		const tenant = definePlugin<{ user: User }>()((app) =>
			app.derive(({ user }) => ({ tenant: `t-${user.id}` })),
		);
		const todos = defineRoutes('/todos').get('/', ({ reply }) =>
			reply(200, 'todos'),
		);
		const app = alxia()
			.plugin(session)
			.plugin(tenant)
			.plugin(todos)
			.get('/', ({ tenant, reply }) => reply(200, tenant));
		expect(await (await app.request('/', ada)).text()).toBe('t-ada');
		expect(await (await app.request('/todos', ada)).text()).toBe('todos');
		// @ts-expect-error the plugin reads "user", which this app's context does not give
		alxia().plugin(tenant);
	});

	test('calls a function with the app, and returns what it returns', () => {
		const seen: unknown[] = [];
		const plugin: Plugin = (app) => {
			seen.push(app);
			return app;
		};
		const app = alxia();
		expect(app.plugin(plugin)).toBe(app);
		expect(app.plugin((given) => given.decorate({ n: 1 }))).toBe(app as never);
		expect(seen).toEqual([app]);
	});
});

describe('app.plugin, given what is no plugin', () => {
	let unhandled: unknown[] = [];
	const record = (reason: unknown) => unhandled.push(reason);
	beforeEach(() => {
		unhandled = [];
		process.on('unhandledRejection', record);
	});
	afterEach(() => {
		process.off('unhandledRejection', record);
	});

	test('throws when a function returns no app, and leaves its promise handled', async () => {
		const untyped = alxia().plugin as (...args: unknown[]) => unknown;
		expect(() => untyped(() => undefined)).toThrow(
			'plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is given to use()',
		);
		expect(() =>
			untyped(async () => {
				throw new Error('a guard taken for a plugin');
			}),
		).toThrow('plugin(): the plugin function returned a promise, not an app');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(unhandled).toEqual([]);
	});

	test('refuses a middleware, which goes to use(): called once with the app, never on a request', async () => {
		const untyped = alxia().plugin as (...args: unknown[]) => unknown;
		let requests = 0;
		const guard = defineMiddleware(async (_ctx, next) => {
			requests += 1;
			return next();
		});
		expect(() => untyped(guard)).toThrow(
			'plugin(): the plugin function returned a promise, not an app: a plugin returns the app it is given; a middleware is given to use()',
		);
		const stamp = (ctx: object) => ({ ...ctx, stamp: 'ok' });
		expect(() => untyped(stamp)).toThrow(
			'plugin(): the plugin function returned object, not an app',
		);
		const sync = (_ctx: object, next: () => unknown) => next();
		expect(() => untyped(sync)).toThrow(
			'plugin(): the plugin function called next(): a plugin returns the app it is given; a middleware is given to use()',
		);
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(unhandled).toEqual([]);
		expect(requests).toBe(1);
	});

	test('refuses a validate, nothing, two plugins, or what is neither an app nor a function', () => {
		const untyped = alxia().plugin as (...args: unknown[]) => unknown;
		const neither =
			'plugin(): the plugin is neither an app nor a function that returns one; a middleware is given to use()';
		expect(() => untyped(validate({}))).toThrow(neither);
		expect(() => untyped({})).toThrow(neither);
		expect(() => untyped('/admin')).toThrow(neither);
		expect(() => untyped()).toThrow(
			'plugin(): nothing is given: an app or a function that returns one; middlewares are given to use()',
		);
		expect(() => untyped(session, session)).toThrow(
			'plugin(): a plugin is given alone: an app or a function that returns one',
		);
		const auth = defineMiddleware((_ctx, next) => next());
		expect(() => untyped('/admin', auth)).toThrow(
			'plugin(): a plugin is given alone',
		);
	});
});
