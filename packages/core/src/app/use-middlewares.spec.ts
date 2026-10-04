import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineHook } from './define-hook';
import { defineMiddleware } from './define-middleware';
import type { Plugin } from './signatures';
import { validate } from './validate';

/** A `user` from `x-user`, or a 401. */
const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } });
});

/** A middleware that logs `name` when it runs, and adds nothing. */
const logs = (log: string[], name: string) =>
	defineMiddleware((_ctx, next) => {
		log.push(name);
		return next();
	});

const user = { headers: { 'x-user': 'ada' } };

describe('app.use(...middlewares)', () => {
	test('runs on the routes declared after it, not before', async () => {
		const app = alxia()
			.get('/before', ({ reply }) => reply(200, 'open'))
			.use(auth)
			.get('/after', ({ user, reply }) => reply(200, user.id));
		expect((await app.request('/before')).status).toBe(200);
		expect((await app.request('/after')).status).toBe(401);
		expect(await (await app.request('/after', user)).text()).toBe('ada');
	});

	test('scope middlewares, then the route’s, then the handler', async () => {
		const log: string[] = [];
		const app = alxia()
			.use(logs(log, 'scope 1'), logs(log, 'scope 2'))
			.use(logs(log, 'scope 3'))
			.get(
				'/',
				(_ctx, next) => {
					log.push('route');
					return next();
				},
				({ reply }) => {
					log.push('handler');
					return reply(200, 'ok');
				},
			);
		await app.request('/');
		expect(log).toEqual(['scope 1', 'scope 2', 'scope 3', 'route', 'handler']);
	});

	test('in a group, stays inside it', async () => {
		const app = alxia()
			.group('/me', (me) =>
				me.use(auth).get('/', ({ user, reply }) => reply(200, user.id)),
			)
			.get('/open', ({ reply }) => reply(200, 'open'));
		expect((await app.request('/me')).status).toBe(401);
		expect((await app.request('/me', user)).status).toBe(200);
		expect((await app.request('/open')).status).toBe(200);
	});

	test('a plugin app’s middlewares apply to the routes declared after it', async () => {
		const plugin = alxia().use(auth);
		const app = alxia()
			.use(plugin)
			.get('/', ({ user, reply }) => reply(200, user.id));
		expect((await app.request('/')).status).toBe(401);
		expect(await (await app.request('/', user)).text()).toBe('ada');
	});

	test('a 404 and a 405 do not pass through them', async () => {
		const log: string[] = [];
		const app = alxia()
			.use(logs(log, 'scope'))
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/missing')).status).toBe(404);
		expect((await app.request('/', { method: 'POST' })).status).toBe(405);
		expect(log).toEqual([]);
	});

	test('a function not made by defineMiddleware is a plugin, as before', async () => {
		const seen: unknown[] = [];
		const plugin: Plugin = (app) => {
			seen.push(app);
			return app;
		};
		const app = alxia().use(plugin);
		expect(seen).toEqual([app]);
		// A plain `(ctx, next)` arrow is called as a plugin, given the app.
		const plain = (_ctx: unknown, next: () => unknown) => next();
		expect(() => alxia().use(plain as never)).toThrow(TypeError);
	});

	test('refuses what is not a middleware among them', () => {
		const label = /use\(\): middleware 2 was not made by defineMiddleware\(\)/;
		expect(() => alxia().use(auth, (() => {}) as never)).toThrow(label);
		expect(() =>
			alxia().use(auth, validate({ query: z.object({}) }) as never),
		).toThrow(/validate\(\) or responds\(\), which belongs to a route/);
		expect(() => alxia().use(defineHook(() => ({})) as never)).toThrow(
			/neither an app nor a function/,
		);
		const untyped = alxia().use as (...args: unknown[]) => unknown;
		expect(() => untyped()).toThrow('use(): nothing is given');
		expect(() => untyped(null)).toThrow(/neither an app nor a function/);
		expect(() => untyped(alxia(), alxia())).toThrow(/a plugin is given alone/);
	});

	test('runs on a socket’s upgrade, as its own middlewares do', async () => {
		const app = alxia()
			.use(auth)
			.ws('/live', {
				open: (socket) => socket.send(socket.data.user.id),
				message: () => {},
			});
		const server = app.listen({ port: 0 });
		try {
			const refused = await app.request('/live', {
				headers: { upgrade: 'websocket' },
			});
			expect(refused.status).toBe(401);
			const url = new URL('/live', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url, user as never);
			const received = await new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(String(event.data));
			});
			socket.close();
			expect(received).toBe('"ada"');
		} finally {
			await server.stop(true);
		}
	});
});
