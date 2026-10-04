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
			'plugin(): the plugin function returned undefined, not an app: a plugin returns the app it is given; a middleware is made with defineMiddleware() and given to use()',
		);
		expect(() =>
			untyped(async () => {
				throw new Error('a guard taken for a plugin');
			}),
		).toThrow('plugin(): the plugin function returned a promise, not an app');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(unhandled).toEqual([]);
	});

	test('refuses a middleware, nothing, two plugins, or what is neither an app nor a function', () => {
		const untyped = alxia().plugin as (...args: unknown[]) => unknown;
		const auth = defineMiddleware((_ctx, next) => next());
		expect(() => untyped(auth)).toThrow(
			'plugin(): a middleware is given to use(), not taken for a plugin',
		);
		expect(() => untyped(validate({}))).toThrow(
			'plugin(): a middleware is given to use()',
		);
		expect(() => untyped()).toThrow('plugin(): nothing is given');
		expect(() => untyped(session, session)).toThrow(
			'plugin(): a plugin is given alone, to app.plugin()',
		);
		expect(() => untyped({})).toThrow(
			'plugin(): the plugin is neither an app nor a function',
		);
	});
});

describe('app.use(plugin), deprecated', () => {
	test('still mounts an app and calls a function, as plugin does', async () => {
		const app = alxia()
			.use(session)
			.use((given) => given.decorate({ n: 1 as const }))
			.get('/', ({ user, n, reply }) => reply(200, `${user.id} ${n}`));
		expect(await (await app.request('/', ada)).text()).toBe('ada 1');
	});

	test('throws on a guard not made by defineMiddleware, rather than call it once as a plugin and never on a request', () => {
		const guard = async (
			ctx: { user?: User; reply: (status: 401) => unknown },
			next: () => Promise<Response>,
		) => (ctx.user ? next() : ctx.reply(401));
		const app = alxia();
		expect(() => app.use(guard as never)).toThrow(
			'use(): the plugin function returned a promise, not an app',
		);
	});
});
