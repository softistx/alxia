/**
 * A 405 at a path several routes own runs every owner's chain in force,
 * in the order declared, each on its own copy of the context the app's
 * chain built: the first refusal answers, and the `Allow` comes once every
 * owner let the request through.
 */
import { describe, expect, test } from 'bun:test';
import { admin, guardOn, ok } from '../../test/fixtures/guards';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

describe('two groups owning methods at one path', () => {
	const shared = () => {
		const seen = guardOn('x-any');
		const first = guardOn('x-first', 401);
		const second = guardOn('x-second', 403);
		const app = alxia()
			.use(seen)
			.group((g) => g.use(first).get('/shared', ok))
			.group((g) => g.use(second).post('/shared', ok));
		return { app, seen, first, second };
	};
	const del = (headers: Record<string, string>) => ({
		method: 'DELETE',
		headers: { 'x-any': '1', ...headers },
	});

	test('run each chain in the order declared, the first refusal answering', async () => {
		const { app, second } = shared();
		expect((await app.request('/shared', del({}))).status).toBe(401);
		expect(second.runs.count).toBe(0);
		const refused = await app.request('/shared', del({ 'x-first': '1' }));
		expect(refused.status).toBe(403);
		expect(refused.headers.get('allow')).toBeNull();
	});

	test("answer the 405 once every chain called next; the app's chain runs once", async () => {
		const { app, seen } = shared();
		const passed = await app.request(
			'/shared',
			del({ 'x-first': '1', 'x-second': '1' }),
		);
		expect(passed.status).toBe(405);
		expect(passed.headers.get('allow')).toBe('GET, POST');
		expect(seen.runs.count).toBe(1);
	});

	test('a group owning two methods runs its chain once', async () => {
		const guard = guardOn('x-admin');
		const app = alxia().group((g) =>
			g.use(guard).get('/both', ok).post('/both', ok),
		);
		await app.request('/both', { method: 'DELETE', headers: admin });
		expect(guard.runs.count).toBe(1);
	});
});

describe("one owner's context never reaches another's guard", () => {
	test("a plugin mounted in two groups runs its guard with each group's derive", async () => {
		const runs = { count: 0 };
		const admins = alxia().use(
			defineMiddleware((ctx, next) => {
				runs.count++;
				const { who } = ctx as { who?: string };
				return who === 'admin' ? next() : ctx.reply(403, { error: 'admin' });
			}),
		);
		const app = alxia()
			.group((g) =>
				g
					.derive(() => ({ who: 'admin' }))
					.plugin(admins)
					.get('/s', ok),
			)
			.group((g) =>
				g
					.derive(({ request }) => ({
						who: request.headers.get('x-who') ?? 'nobody',
					}))
					.plugin(admins)
					.post('/s', ok),
			);
		expect((await app.request('/s', { method: 'POST' })).status).toBe(403);
		const denied = await app.request('/s', { method: 'DELETE' });
		expect(denied.status).toBe(403);
		expect(denied.headers.get('allow')).toBeNull();
		runs.count = 0;
		const passed = await app.request('/s', {
			method: 'DELETE',
			headers: { 'x-who': 'admin' },
		});
		expect(passed.headers.get('allow')).toBe('GET, POST');
		expect(runs.count).toBe(2);
	});

	test("what one group's derive adds is not on the next group's context", async () => {
		const requireAdmin = defineMiddleware<{ isAdmin?: boolean }>()(
			({ isAdmin, reply }, next) =>
				isAdmin === true ? next() : reply(403, { error: 'admin' }),
		);
		const app = alxia()
			.group((g) => g.derive(() => ({ isAdmin: true })).get('/s', ok))
			.group((g) =>
				g
					.derive(({ request }): { isAdmin?: boolean } =>
						request.headers.has('x-key') ? { isAdmin: true } : {},
					)
					.use(requireAdmin)
					.post('/s', ok),
			);
		expect((await app.request('/s', { method: 'POST' })).status).toBe(403);
		expect((await app.request('/s', { method: 'DELETE' })).status).toBe(403);
		const passed = await app.request('/s', {
			method: 'DELETE',
			headers: { 'x-key': '1' },
		});
		expect(passed.status).toBe(405);
	});

	test("an owner's middleware awaits the real 405 from next", async () => {
		const stamp = defineMiddleware(async (_ctx, next) => {
			const response = await next();
			response.headers.set('x-stamped', '1');
			return response;
		});
		const app = alxia().group((g) => g.use(stamp).get('/s', ok));
		const response = await app.request('/s', { method: 'DELETE' });
		expect(response.status).toBe(405);
		expect(response.headers.get('x-stamped')).toBe('1');
	});
});
