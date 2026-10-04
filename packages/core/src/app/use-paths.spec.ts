import { describe, expect, test } from 'bun:test';
import { type Alxia, alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

/** A 401 unless `x-admin` is sent; adds nothing. */
const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin')
		? next()
		: reply(401, { error: 'admins only' as const }),
);

/** A middleware that logs `name` when it runs, and adds nothing. */
const logs = (log: string[], name: string) =>
	defineMiddleware((_ctx, next) => {
		log.push(name);
		return next();
	});

describe('app.use(path, ...middlewares)', () => {
	/** Which of `paths` a request passes `admin` on, declared after `use`. */
	async function guarded(
		use: (app: Alxia) => Alxia,
		paths: readonly string[],
	): Promise<string[]> {
		let app = use(alxia());
		for (const path of paths) {
			app = app.get(path as '/', ({ reply }) => reply(200, 'ok'));
		}
		const refused: string[] = [];
		for (const path of paths) {
			const url = path.replaceAll(/:\w+|\*/g, 'x');
			if ((await app.request(url)).status === 401) refused.push(path);
		}
		return refused;
	}

	test('a prefix: the route at it and every route under it', async () => {
		const paths = ['/admin', '/admin/stats', '/admin/:id/x', '/administrators'];
		expect(await guarded((app) => app.use('/admin', admin), paths)).toEqual([
			'/admin',
			'/admin/stats',
			'/admin/:id/x',
		]);
	});

	test('/*: the routes under it, not at it', async () => {
		const paths = ['/admin', '/admin/stats', '/admin/*'];
		expect(await guarded((app) => app.use('/admin/*', admin), paths)).toEqual([
			'/admin/stats',
			'/admin/*',
		]);
	});

	test(':param: any one segment; a literal, that literal alone', async () => {
		const paths = ['/users/:id/posts', '/users/me/posts', '/users/:id', '/x'];
		expect(
			await guarded((app) => app.use('/users/:any/posts', admin), paths),
		).toEqual(['/users/:id/posts', '/users/me/posts']);
		expect(
			await guarded((app) => app.use('/users/me', admin), ['/users/:id']),
		).toEqual([]);
	});

	test('is joined to the prefix of the groups it is declared in', async () => {
		const log: string[] = [];
		const app = alxia({ prefix: '/api' })
			.group('/v1', (v1) =>
				v1
					.use('/admin', logs(log, 'v1 admin'))
					.group('/admin', (inner) =>
						inner.get('/stats', ({ reply }) => reply(200, 'ok')),
					)
					.get('/open', ({ reply }) => reply(200, 'ok')),
			)
			.use('/v2/*', logs(log, 'v2'))
			.get('/v2/x', ({ reply }) => reply(200, 'ok'))
			.get('/v1/later', ({ reply }) => reply(200, 'ok'));
		for (const path of ['/api/v1/admin/stats', '/api/v1/open', '/api/v2/x']) {
			await app.request(path);
		}
		await app.request('/api/v1/later');
		expect(log).toEqual(['v1 admin', 'v2']);
	});

	test('a scoped guard answers 401, before the route’s own', async () => {
		const log: string[] = [];
		const app = alxia()
			.use('/admin', admin)
			.get('/admin/stats', logs(log, 'route'), ({ reply }) => reply(200, 'ok'));
		const refused = await app.request('/admin/stats');
		expect(refused.status).toBe(401);
		expect(await refused.json()).toEqual({ error: 'admins only' });
		expect(log).toEqual([]);
		const passed = await app.request('/admin/stats', {
			headers: { 'x-admin': '1' },
		});
		expect(passed.status).toBe(200);
		expect(log).toEqual(['route']);
	});

	test('a plugin’s scoped middleware moves under the prefix it is used at', async () => {
		const log: string[] = [];
		const plugin = alxia()
			.use('/admin', logs(log, 'plugin'))
			.get('/admin/x', ({ reply }) => reply(200, 'ok'));
		const app = alxia({ prefix: '/api' })
			.use(plugin)
			.get('/admin/y', ({ reply }) => reply(200, 'ok'))
			.get('/open', ({ reply }) => reply(200, 'ok'));
		for (const path of ['/api/admin/x', '/api/admin/y', '/api/open']) {
			await app.request(path);
		}
		expect(log).toEqual(['plugin', 'plugin']);
	});

	test('reaches a plugin app’s routes under it, used after it', async () => {
		const log: string[] = [];
		const plugin = alxia()
			.get('/admin/x', ({ reply }) => reply(200, 'ok'))
			.get('/open', ({ reply }) => reply(200, 'ok'));
		const app = alxia().use('/admin', logs(log, 'parent')).use(plugin);
		await app.request('/admin/x');
		await app.request('/open');
		expect(log).toEqual(['parent']);
	});

	test('runs on a socket’s upgrade under it', async () => {
		const app = alxia()
			.use('/live', admin)
			.ws('/live/:room', { message: () => {} });
		const refused = await app.request('/live/lobby', {
			headers: { upgrade: 'websocket' },
		});
		expect(refused.status).toBe(401);
	});

	test('matches the declared path: a parameter route is not under a literal', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/:section', ({ reply }) => reply(200, 'unguarded'));
		// `/admin` reaches `/:section`, declared at a path `/admin` does not match.
		expect((await app.request('/admin')).status).toBe(200);
	});

	test('refuses a path a route could not be declared at, or no middleware', () => {
		expect(() => alxia().use('/admin/' as '/', admin)).toThrow(
			'use("/admin/"): a path given to use() does not end with "/"',
		);
		expect(() => alxia().use('/a/*/b' as '/', admin)).toThrow(
			'use("/a/*/b"): "/a/*/b": "*" may only end a path',
		);
		expect(() => alxia().use('/admin' as never)).toThrow(
			'use("/admin"): no middleware is given',
		);
	});
});
