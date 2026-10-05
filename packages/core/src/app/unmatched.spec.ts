/**
 * A request no route matches — a 404, a 405, a CORS preflight, a 426 —
 * runs the app's chain, every middleware given to `use` wherever it was
 * declared, then the router's answer: the middlewares wrap the router.
 */
import { describe, expect, test } from 'bun:test';
import { HttpError } from '../errors/errors';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

/** A middleware that logs `name` and the route it saw, and adds nothing. */
const logs = (log: string[], name: string) =>
	defineMiddleware(({ route }, next) => {
		log.push(`${name} ${route ?? '-'}`);
		return next();
	});

describe('a request no route matches', () => {
	test('runs every use() middleware, in the order declared, then the 404', async () => {
		const log: string[] = [];
		const app = alxia()
			.use(logs(log, 'first'))
			.get('/', ({ reply }) => reply(200, 'home'))
			.use(logs(log, 'last'));
		const response = await app.request('/missing');
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'not_found' });
		// No route: `ctx.route` is none.
		expect(log).toEqual(['first -', 'last -']);
	});

	test('a 405 keeps its Allow, a middleware may answer an OPTIONS before it', async () => {
		const preflight = defineMiddleware(({ request }, next) =>
			request.method === 'OPTIONS'
				? new Response(null, { status: 204, headers: { 'x-preflight': '1' } })
				: next(),
		);
		const app = alxia()
			.use(preflight)
			.get('/items', ({ reply }) => reply(200, []));
		const refused = await app.request('/items', { method: 'DELETE' });
		expect(refused.status).toBe(405);
		expect(refused.headers.get('allow')).toBe('GET');
		const options = await app.request('/items', { method: 'OPTIONS' });
		expect(options.status).toBe(204);
		expect(options.headers.get('x-preflight')).toBe('1');
	});

	test('what a middleware sets on the response reaches the 404', async () => {
		const tagged = defineMiddleware(({ set }, next) => {
			set.headers.set('x-tag', 'set');
			return next();
		});
		const after = defineMiddleware(async (_ctx, next) => {
			const response = await next();
			response.headers.set('x-after', 'awaited');
			return response;
		});
		const app = alxia().use(tagged, after);
		const response = await app.request('/missing');
		expect(response.status).toBe(404);
		expect(response.headers.get('x-tag')).toBe('set');
		expect(response.headers.get('x-after')).toBe('awaited');
	});

	test('a middleware may end it: a 401 before the 404', async () => {
		const auth = defineMiddleware(({ request, reply }, next) =>
			request.headers.has('x-user')
				? next()
				: reply(401, { error: 'unauthorized' as const }),
		);
		const app = alxia()
			.use(auth)
			.get('/', ({ reply }) => reply(200, 'home'));
		expect((await app.request('/missing')).status).toBe(401);
		const through = await app.request('/missing', {
			headers: { 'x-user': 'ada' },
		});
		expect(through.status).toBe(404);
	});

	test('derive and decorate run too, so what a use() after them reads is there', async () => {
		const seen: unknown[] = [];
		const app = alxia()
			.decorate({ region: 'eu' as const })
			.derive(() => ({ user: { id: 'ada' } }))
			.use(
				defineMiddleware<{ region: 'eu'; user: { id: string } }>()(
					({ region, user }, next) => {
						seen.push(`${region} ${user.id}`);
						return next();
					},
				),
			);
		expect((await app.request('/missing')).status).toBe(404);
		expect(seen).toEqual(['eu ada']);
	});

	test('a group’s middlewares run under its prefix alone', async () => {
		const log: string[] = [];
		const app = alxia()
			.group('/admin', (admin) =>
				admin
					.use(logs(log, 'admin'))
					.get('/stats', ({ reply }) => reply(200, 1)),
			)
			.get('/after', ({ reply }) => reply(200, 2));
		expect((await app.request('/admin/missing')).status).toBe(404);
		expect(log).toEqual(['admin -']);
		expect((await app.request('/missing')).status).toBe(404);
		expect((await app.request('/after')).status).toBe(200);
		expect(log).toEqual(['admin -']);
		expect((await app.request('/admin/stats')).status).toBe(200);
		expect(log).toEqual(['admin -', 'admin /admin/stats']);
	});

	test('a plugin’s middlewares are the app’s: they run on it too', async () => {
		const log: string[] = [];
		const plugin = alxia().use(logs(log, 'plugin'));
		const app = alxia().plugin(plugin);
		expect((await app.request('/missing')).status).toBe(404);
		expect(log).toEqual(['plugin -']);
	});

	test('an error is answered by a try/catch middleware around it, else an HttpError as it says, else a 500', async () => {
		const throws = defineMiddleware(({ request }) => {
			if (request.headers.has('x-http')) throw new HttpError(418, 'teapot');
			throw new Error(request.headers.get('x-boom') ?? 'boom');
		});
		const app = alxia()
			.use(async ({ reply }, next) => {
				try {
					return await next();
				} catch (error) {
					if (error instanceof Error && error.message === 'handled') {
						return reply(503, 'handled');
					}
					throw error;
				}
			})
			.use(throws);
		const handled = await app.request('/x', {
			headers: { 'x-boom': 'handled' },
		});
		expect(handled.status).toBe(503);
		const http = await app.request('/x', { headers: { 'x-http': '1' } });
		expect(http.status).toBe(418);
		const original = console.error;
		console.error = () => {};
		try {
			expect((await app.request('/x')).status).toBe(500);
		} finally {
			console.error = original;
		}
	});

	test('a route runs only the use() middlewares declared before it', async () => {
		const log: string[] = [];
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.use(logs(log, 'late'))
			.get('/late', ({ reply }) => reply(200, 'late'));
		await app.request('/early');
		await app.request('/late');
		await app.request('/none');
		expect(log).toEqual(['late /late', 'late -']);
	});
});
