/**
 * `app.all(path, options?, end)`: an `all` route ended by a middleware that
 * answers, as `proxy(url)` is, in place of a handler. Its `Response` is
 * sent as a middleware's is; its `next()` answers 404, nothing being after
 * it. What it reads is checked against the route's context.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from './alxia';
import { settle } from './boundary';
import { defineMiddleware } from './define-middleware';

/** A stand-in for `proxy(url)`: answers with a `Response` of its own. */
const forward = defineMiddleware(async function forward({ request, url }) {
	return new Response(`${request.method} ${url.pathname}`, {
		headers: { 'x-from': 'upstream' },
	});
});

describe('an all route ended by a middleware', () => {
	test('sends its Response, for every method, behind the chain in force', async () => {
		const seen: string[] = [];
		const app = alxia()
			.use(async (ctx, next) => {
				const response = await settle(ctx, next());
				seen.push(`${ctx.request.method} ${response.status}`);
				return response;
			})
			.all('/api/*', forward);
		for (const method of ['GET', 'POST', 'DELETE']) {
			const response = await app.request('/api/users/7', { method });
			expect(response.headers.get('x-from')).toBe('upstream');
			expect(await response.text()).toBe(`${method} /api/users/7`);
		}
		expect(seen).toEqual(['GET 200', 'POST 200', 'DELETE 200']);
	});

	test('takes the options first; an explicit route at its path still wins', async () => {
		const app = alxia()
			.all('/api/*', { bodyLimit: 1024 }, forward)
			.get('/api/*', ({ reply }) => reply(200, 'local'));
		expect(await (await app.request('/api/x')).text()).toBe('local');
		expect(await (await app.request('/api/x', { method: 'PUT' })).text()).toBe(
			'PUT /api/x',
		);
		expect(app.routes[0]?.bodyLimit).toBe(1024);
	});

	test('its next() answers 404: nothing is after it', async () => {
		const app = alxia().all('/maybe', (_ctx, next) => next());
		const response = await app.request('/maybe', { method: 'PATCH' });
		expect(response.status).toBe(404);
	});

	test('a handler returning a Response is still refused: only an all route takes one', async () => {
		const app = alxia().get(
			'/raw',
			// @ts-expect-error a handler returns a reply, not a Response
			() => new Response('raw'),
		);
		expect((await app.request('/raw')).status).toBe(500);
	});

	test('what it reads is checked against the context in force', () => {
		const needsUser = defineMiddleware<{ user: string }>()(({ user }) =>
			Promise.resolve(new Response(user)),
		);
		alxia()
			.derive(() => ({ user: 'ada' }))
			.all('/me/*', needsUser);
		// @ts-expect-error the app gives no `user`
		alxia().all('/me/*', needsUser);
		alxia().all('/files/:name', ({ params }) => {
			expectTypeOf(params.name).toEqualTypeOf<string>();
			return new Response(params.name);
		});
	});
});
