import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
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
			.plugin(plugin)
			.get('/', ({ user, reply }) => reply(200, user.id));
		expect((await app.request('/')).status).toBe(401);
		expect(await (await app.request('/', user)).text()).toBe('ada');
	});

	test('a 404 and a 405 pass through them, a use() after the last route included', async () => {
		const log: string[] = [];
		const app = alxia()
			.use(logs(log, 'before'))
			.get('/', ({ reply }) => reply(200, 'ok'))
			.use(logs(log, 'after'));
		expect((await app.request('/missing')).status).toBe(404);
		const refused = await app.request('/', { method: 'POST' });
		expect(refused.status).toBe(405);
		expect(refused.headers.get('allow')).toBe('GET');
		expect(log).toEqual(['before', 'after', 'before', 'after']);
		// The route runs only what was declared before it.
		log.length = 0;
		expect((await app.request('/')).status).toBe(200);
		expect(log).toEqual(['before']);
	});

	test('refuses what is not a middleware among them, naming it', () => {
		const untyped = alxia().use as (...args: unknown[]) => unknown;
		expect(() => untyped(auth, 'auth')).toThrow(
			'use(): argument 2 is not a function: a middleware is (ctx, next) => …',
		);
		expect(() => untyped(auth, validate({ query: z.object({}) }))).toThrow(
			'use(): argument 2 is a validate() or responds(), which belongs to a route',
		);
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
