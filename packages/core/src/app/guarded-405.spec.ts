/**
 * What tells a path's methods — a 405's `Allow`, a 426 — runs behind the
 * chain in force of every route at that path: a group's guard, with a
 * prefix or without, refuses it as it refuses the route. A 404 names
 * nothing, and runs the app's chain alone.
 */
import { describe, expect, test } from 'bun:test';
import { admin, guardOn, ok } from '../../test/fixtures/guards';
import { alxia } from './alxia';

describe("an unprefixed group's guard, on a 405 at its route's path", () => {
	const app = () => {
		const guard = guardOn('x-admin');
		return {
			guard,
			app: alxia()
				.group((g) => g.use(guard).get('/secret', ok))
				.get('/public', ok),
		};
	};

	test('refuses it: its answer, no Allow', async () => {
		const denied = await app().app.request('/secret', { method: 'DELETE' });
		expect(denied.status).toBe(401);
		expect(denied.headers.get('allow')).toBeNull();
		expect(await denied.json()).toEqual({ error: 'x-admin' });
	});

	test('lets an authorized request through to the 405 and its Allow', async () => {
		const passed = await app().app.request('/secret', {
			method: 'DELETE',
			headers: admin,
		});
		expect(passed.status).toBe(405);
		expect(passed.headers.get('allow')).toBe('GET');
	});

	test('a HEAD the route does not take is refused the same; one its GET takes runs the route', async () => {
		const posts = alxia().group((g) =>
			g.use(guardOn('x-admin')).post('/secret', ok),
		);
		const head = await posts.request('/secret', { method: 'HEAD' });
		expect(head.status).toBe(401);
		expect(head.headers.get('allow')).toBeNull();
		expect(
			(await app().app.request('/secret', { method: 'HEAD' })).status,
		).toBe(401);
	});

	test("never runs on a 404, nor on an unguarded route's 405", async () => {
		const { app: served, guard } = app();
		expect((await served.request('/missing')).status).toBe(404);
		const open = await served.request('/public', { method: 'DELETE' });
		expect(open.status).toBe(405);
		expect(open.headers.get('allow')).toBe('GET');
		expect(guard.runs.count).toBe(0);
	});

	test("a route's own middleware is its method's alone", async () => {
		const own = alxia().get('/x', guardOn('x-admin'), ok);
		const response = await own.request('/x', { method: 'DELETE' });
		expect(response.status).toBe(405);
	});

	test('refuses the 426 of a socket route', async () => {
		const sockets = alxia().group((g) =>
			g.use(guardOn('x-admin')).ws('/live', { message() {} }),
		);
		expect((await sockets.request('/live')).status).toBe(401);
		expect((await sockets.request('/live', { headers: admin })).status).toBe(
			426,
		);
	});
});

describe('a prefixed group, on a 405 under its prefix', () => {
	test('is unchanged: its guard runs once, before the 405', async () => {
		const guard = guardOn('x-admin');
		const app = alxia().group('/admin', (g) => g.use(guard).get('/secret', ok));
		const denied = await app.request('/admin/secret', { method: 'DELETE' });
		expect(denied.status).toBe(401);
		expect(denied.headers.get('allow')).toBeNull();
		guard.runs.count = 0;
		const passed = await app.request('/admin/secret', {
			method: 'DELETE',
			headers: admin,
		});
		expect(passed.status).toBe(405);
		expect(guard.runs.count).toBe(1);
	});
});

describe('a mounted plugin', () => {
	const routes = () =>
		alxia().group((g) => g.use(guardOn('x-admin')).get('/secret', ok));

	test("guards its unprefixed group's 405, wherever it is mounted", async () => {
		for (const [app, path] of [
			[alxia().plugin(routes()), '/secret'],
			[alxia({ prefix: '/api' }).plugin(routes()), '/api/secret'],
			[alxia().group('/v1', (v1) => v1.plugin(routes())), '/v1/secret'],
		] as const) {
			const denied = await app.request(path, { method: 'DELETE' });
			expect(denied.status).toBe(401);
			expect(denied.headers.get('allow')).toBeNull();
			const passed = await app.request(path, {
				method: 'DELETE',
				headers: admin,
			});
			expect(passed.headers.get('allow')).toBe('GET');
		}
	});

	test("an app mounted in an unprefixed group: its use() is the group's chain", async () => {
		const app = alxia().group((g) =>
			g.plugin(alxia().use(guardOn('x-admin')).get('/secret', ok)),
		);
		expect((await app.request('/secret', { method: 'DELETE' })).status).toBe(
			401,
		);
		expect((await app.request('/missing')).status).toBe(404);
	});

	test('use(path, guard) refuses the 405 under its path, once, a plugin rebased', async () => {
		const guard = guardOn('x-admin');
		const scoped = alxia().use('/secret', guard).get('/secret', ok);
		for (const [app, path] of [
			[scoped, '/secret'],
			[alxia({ prefix: '/api' }).plugin(scoped), '/api/secret'],
			[alxia().group((g) => g.plugin(scoped)), '/secret'],
		] as const) {
			expect((await app.request(path, { method: 'DELETE' })).status).toBe(401);
			guard.runs.count = 0;
			const passed = await app.request(path, {
				method: 'DELETE',
				headers: admin,
			});
			expect(passed.status).toBe(405);
			expect(guard.runs.count).toBe(1);
		}
	});

	test('a use(path) a route parameter may reach runs on the 405 the path decides', async () => {
		const guard = guardOn('x-admin');
		const app = alxia().group((g) =>
			g.use('/users/admin', guard).get('/users/:id', ok).post('/users/:id', ok),
		);
		expect(
			(await app.request('/users/admin', { method: 'DELETE' })).status,
		).toBe(401);
		guard.runs.count = 0;
		expect((await app.request('/users/bob', { method: 'DELETE' })).status).toBe(
			405,
		);
		expect(guard.runs.count).toBe(0);
		await app.request('/users/admin', { method: 'DELETE', headers: admin });
		expect(guard.runs.count).toBe(1);
	});
});
