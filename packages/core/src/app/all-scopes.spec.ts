/**
 * An `all` route where a route can stand: in a group, in a plugin with a
 * prefix of its own, on a fork; behind the chains in force there. In dev
 * the route table lists it as `ALL`, and a 404's hint offers it whatever
 * the request's method. A `use(path, …)` before it runs for every method.
 */
import { describe, expect, test } from 'bun:test';
import { admin, guardOn } from '../../test/fixtures/guards';
import { closestRoute } from '../dev/hint';
import { alxia } from './alxia';
import { defineRoutes } from './define-plugin';

const method = alxia({ prefix: '/up' }).all('/*', ({ request, url, reply }) =>
	reply(200, `${request.method} ${url.pathname}`),
);

describe('in a group and a plugin', () => {
	test("a group's all route is under its prefix, behind its guard, for every method", async () => {
		const guard = guardOn('x-admin');
		const app = alxia()
			.group('/admin', (g) =>
				g
					.use(guard)
					.all('/*', ({ request, reply }) => reply(200, request.method)),
			)
			.get('/admin/open', ({ reply }) => reply(200, 'open'));
		const denied = await app.request('/admin/x', { method: 'DELETE' });
		expect(denied.status).toBe(401);
		const passed = await app.request('/admin/x', {
			method: 'DELETE',
			headers: admin,
		});
		expect(await passed.text()).toBe('DELETE');
		expect(await (await app.request('/admin/open')).text()).toBe('open');
		expect(guard.runs.count).toBe(2);
	});

	test("a plugin's is rebased with its prefix, and listed so", async () => {
		const app = alxia().plugin(method);
		const response = await app.request('/up/a/b', { method: 'PATCH' });
		expect(await response.text()).toBe('PATCH /up/a/b');
		expect(app.routes.map((r) => `${r.method} ${r.path}`)).toEqual([
			'ALL /up/*',
		]);
	});

	test('defineRoutes takes one too', async () => {
		const routes = defineRoutes('/r').all('/:id', ({ params, reply }) =>
			reply(200, params.id),
		);
		const app = alxia().plugin(routes);
		expect(await (await app.request('/r/7', { method: 'PUT' })).text()).toBe(
			'7',
		);
	});

	test('a use(path, …) before it runs for every method; an explicit route still wins', async () => {
		const guard = guardOn('x-admin');
		const app = alxia()
			.use('/api', guard)
			.all('/api/*', ({ reply }) => reply(200, 'all'))
			.post('/api/login', ({ reply }) => reply(200, 'login'));
		expect((await app.request('/api/x', { method: 'PUT' })).status).toBe(401);
		const login = await app.request('/api/login', {
			method: 'POST',
			headers: admin,
		});
		expect(await login.text()).toBe('login');
	});
});

describe('fork', () => {
	test('copies it; what the fork declares next stays its own', async () => {
		const base = alxia().all('/any', ({ reply }) => reply(200, 'base'));
		const forked = base.fork().get('/any', ({ reply }) => reply(200, 'fork'));
		expect(await (await forked.request('/any')).text()).toBe('fork');
		expect(
			await (await forked.request('/any', { method: 'POST' })).text(),
		).toBe('base');
		expect(await (await base.request('/any')).text()).toBe('base');
	});
});

describe('in dev', () => {
	const app = () =>
		alxia({ dev: true })
			.get('/todos', ({ reply }) => reply(200, []))
			.all(
				'/upstream/*',
				function auth(_ctx, next) {
					return next();
				},
				function proxied({ reply }) {
					return reply(200, 'x');
				},
			);

	test('the route table lists it as ALL, with its middlewares', async () => {
		let table = '';
		const served = app();
		served.listen({
			port: 0,
			signals: false,
			onListen: (info) => {
				table = info.table;
				expect(info.routes.map((row) => row.method)).toEqual(['GET', 'ALL']);
			},
		});
		await served.stop(true);
		expect(table).toContain('ALL  /upstream/*  auth → proxied');
	});

	test("a 404's hint offers it whatever the method", async () => {
		// A route behind its own middleware is never offered: this one has none.
		const open = alxia({ dev: true }).all('/upstream/*', ({ reply }) =>
			reply(200, 'x'),
		);
		const response = await open.request('/upstrem', { method: 'DELETE' });
		expect(response.status).toBe(404);
		expect((await response.json()).hint).toBe('did you mean ALL /upstream/*?');
		expect(closestRoute('PUT', '/todo', [['ALL', '/todos']])).toBe(
			'ALL /todos',
		);
	});
});
