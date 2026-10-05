/**
 * Where a plugin's and a group's middlewares run once mounted: a plugin's
 * own `use(path, …)` moves under the prefix it is mounted at, a plugin
 * with a prefix of its own keeps its chain to its routes and to what no
 * route answers under that prefix, as a group does.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia, type ContextOf } from './alxia';
import { defineMiddleware } from './define-middleware';
import { defineRoutes } from './define-plugin';

const guard = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin')
		? next()
		: reply(401, { error: 'no' as const }),
);

const status = async (
	app: { request: (path: string, init?: RequestInit) => Promise<Response> },
	path: string,
	init?: RequestInit,
) => (await app.request(path, init)).status;

describe("a plugin's own use(path, guard), mounted under a prefix", () => {
	const plugin = () =>
		alxia()
			.use('/admin', guard)
			.get('/:section/panel', ({ reply }) => reply(200, 'panel'))
			.get('/admin/static', ({ reply }) => reply(200, 'static'));

	test('moves under the prefix of the app, or of the group, it is mounted in', async () => {
		const apps = [
			alxia({ prefix: '/api' }).plugin(plugin()),
			alxia().group('/api', (api) => api.plugin(plugin())),
		];
		for (const app of apps) {
			expect(await status(app, '/api/admin/panel')).toBe(401);
			expect(await status(app, '/api/admin/static')).toBe(401);
			expect(await status(app, '/api/public/panel')).toBe(200);
		}
		expect(await status(alxia().plugin(plugin()), '/admin/panel')).toBe(401);
	});

	test('guards static files mounted in a group', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'alxia-plugin-'));
		mkdirSync(join(dir, 'private'));
		writeFileSync(join(dir, 'private', 's.txt'), 'secret');
		writeFileSync(join(dir, 'open.txt'), 'open');
		const files = () => alxia().use('/private', guard).static('/', dir);
		for (const app of [
			alxia().group('/files', (g) => g.plugin(files())),
			alxia({ prefix: '/files' }).plugin(files()),
		]) {
			expect(await status(app, '/files/private/s.txt')).toBe(401);
			expect(await status(app, '/files/open.txt')).toBe(200);
		}
	});
});

describe('a plugin with a prefix of its own', () => {
	test('keeps its middlewares to its routes and to what no route answers under it', async () => {
		const todos = alxia({ prefix: '/todos' })
			.use(guard)
			.get('/', ({ reply }) => reply(200, 'todos'));
		const app = alxia()
			.plugin(todos)
			.get('/public', ({ reply }) => reply(200, 'public'));
		expect(await status(app, '/public')).toBe(200);
		expect(await status(app, '/missing')).toBe(404);
		expect(await status(app, '/todos')).toBe(401);
		expect(await status(app, '/todos/missing')).toBe(401);
		expect(await status(app, '/todos', { headers: { 'x-admin': '1' } })).toBe(
			200,
		);
	});

	test('defineRoutes(prefix) is one, under the prefix it is mounted at', async () => {
		const todos = defineRoutes('/todos')
			.use(guard)
			.get('/', ({ reply }) => reply(200, 'todos'));
		const app = alxia({ prefix: '/api' })
			.plugin(todos)
			.get('/public', ({ reply }) => reply(200, 'public'));
		expect(await status(app, '/api/public')).toBe(200);
		expect(await status(app, '/api/todos')).toBe(401);
		expect(await status(app, '/api/todos/x')).toBe(401);
		expect(await status(app, '/api/other')).toBe(404);
	});

	test('adds nothing to the context of the routes after it; one without a prefix does', () => {
		const stamp = defineMiddleware((_ctx, next) => next({ stamp: 1 }));
		const prefixed = alxia().plugin(alxia({ prefix: '/p' }).use(stamp));
		const bare = alxia().plugin(alxia().use(stamp));
		expectTypeOf<ContextOf<typeof prefixed>>().not.toHaveProperty('stamp');
		expectTypeOf<ContextOf<typeof bare>>().toHaveProperty('stamp');
	});

	test('one without a prefix keeps its middlewares app-wide', async () => {
		const app = alxia()
			.plugin(alxia().use(guard))
			.get('/public', ({ reply }) => reply(200, 'public'));
		expect(await status(app, '/public')).toBe(401);
		expect(await status(app, '/missing')).toBe(401);
	});
});

describe("a group's middlewares, on a request no route matches under its prefix", () => {
	test('a guard answers before the 405, which would tell its methods', async () => {
		const app = alxia()
			.group('/admin', (admin) =>
				admin.use(guard).get('/secret', ({ reply }) => reply(200, 'secret')),
			)
			.get('/public', ({ reply }) => reply(200, 'public'));
		const denied = await app.request('/admin/secret', { method: 'DELETE' });
		expect(denied.status).toBe(401);
		expect(denied.headers.get('allow')).toBeNull();
		expect(await status(app, '/admin/missing')).toBe(401);
		expect(await status(app, '/public', { method: 'DELETE' })).toBe(405);
		expect(await status(app, '/missing')).toBe(404);
	});

	test("a group's derive runs before its guard there too", async () => {
		const reads = defineMiddleware<{ role: string }>()(
			({ role, reply }, next) =>
				role === 'admin' ? next() : reply(403, { error: 'role' as const }),
		);
		const app = alxia().group('/admin', (admin) =>
			admin
				.derive(({ request }) => ({
					role: request.headers.get('x-role') ?? '',
				}))
				.use(reads)
				.get('/secret', ({ reply }) => reply(200, 'secret')),
		);
		expect(await status(app, '/admin/missing')).toBe(403);
		expect(
			await status(app, '/admin/missing', { headers: { 'x-role': 'admin' } }),
		).toBe(404);
	});

	test('a group without a prefix is a scope alone: nothing it holds runs on a request no route matches', async () => {
		const app = alxia()
			.group((scope) =>
				scope.use(guard).get('/secret', ({ reply }) => reply(200, 'secret')),
			)
			.get('/public', ({ reply }) => reply(200, 'public'));
		expect(await status(app, '/secret')).toBe(401);
		expect(await status(app, '/missing')).toBe(404);
		expect(await status(app, '/secret', { method: 'DELETE' })).toBe(405);
		expect(await status(app, '/public')).toBe(200);
	});

	test('a group inside a mounted app guards its prefix, as it does on the app itself', async () => {
		const admin = alxia().group('/admin', (g) =>
			g.use(guard).get('/secret', ({ reply }) => reply(200, 'secret')),
		);
		const bare = alxia().group((g) =>
			g.use(guard).get('/secret', ({ reply }) => reply(200, 'secret')),
		);
		for (const [app, prefix] of [
			[alxia().plugin(admin), ''],
			[alxia({ prefix: '/api' }).plugin(admin), '/api'],
			[alxia({ prefix: '/p' }).group('/admin', (g) => g.use(guard)), '/p'],
		] as const) {
			expect(await status(app, `${prefix}/admin/missing`)).toBe(401);
			expect(await status(app, `${prefix}/missing`)).toBe(404);
		}
		const mounted = alxia().plugin(bare);
		expect(await status(mounted, '/secret')).toBe(401);
		expect(await status(mounted, '/missing')).toBe(404);
	});
});
