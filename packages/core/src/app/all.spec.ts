/**
 * `app.all(path, …)`: one route for every method at its path. A route of
 * the path's own method wins over it, whatever the order declared; a
 * `HEAD` goes to the path's `GET` first; a socket's upgrade needs a `ws`
 * route; the path never answers 405. The router picks the path before the
 * method, as `Bun.serve` does: a literal path's own routes are not
 * completed by an `all` route at a wildcard.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { validate } from './validate';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY'];

const echo = alxia().all('/echo', ({ request, reply }) =>
	reply(200, { method: request.method }),
);

describe('an all route', () => {
	test('every method reaches it, a custom one included', async () => {
		for (const method of [...METHODS, 'PROPFIND']) {
			const response = await echo.request('/echo', { method });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ method });
		}
	});

	test('a HEAD reaches it too, answered without a body', async () => {
		const response = await echo.request('/echo', { method: 'HEAD' });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('json');
		expect(await response.text()).toBe('');
	});

	test('is listed in app.routes as ALL', () => {
		expect(echo.routes.map(({ method, path }) => [method, path])).toEqual([
			['ALL', '/echo'],
		]);
	});

	test('declared twice at one path is refused', () => {
		const ok = () => ({}) as never;
		expect(() => alxia().all('/x', ok).all('/x', ok)).toThrow(
			'ALL /x is declared twice',
		);
	});
});

describe('an explicit route at the same path', () => {
	const mixed = (allFirst: boolean) => {
		const app = alxia();
		const all = () => app.all('/r', ({ reply }) => reply(200, 'all'));
		if (allFirst) all();
		app
			.get('/r', ({ reply }) => reply(200, 'get'))
			.delete('/r', ({ reply }) => reply(200, 'delete'));
		if (!allFirst) all();
		return app;
	};

	for (const allFirst of [true, false]) {
		test(`wins over it, declared ${allFirst ? 'after' : 'before'} it`, async () => {
			const app = mixed(allFirst);
			const text = async (method: string) =>
				(await app.request('/r', { method })).text();
			expect(await text('GET')).toBe('get');
			expect(await text('DELETE')).toBe('delete');
			expect(await text('POST')).toBe('all');
			expect(await text('OPTIONS')).toBe('all');
		});
	}

	test("a HEAD goes to the path's HEAD route, else its GET, before the all one", async () => {
		const seen: string[] = [];
		const app = alxia()
			.all('/h', ({ reply }) => {
				seen.push('all');
				return reply(200, 'all');
			})
			.get('/h', ({ reply }) => {
				seen.push('get');
				return reply(200, 'get');
			});
		const head = await app.request('/h', { method: 'HEAD' });
		expect(head.status).toBe(200);
		expect(await head.text()).toBe('');
		app.head('/h', ({ reply }) => {
			seen.push('head');
			return reply(204);
		});
		expect((await app.request('/h', { method: 'HEAD' })).status).toBe(204);
		expect(seen).toEqual(['get', 'head']);
	});

	test("a socket's upgrade needs a ws route: the all one is not one", async () => {
		const upgrade = { headers: { upgrade: 'websocket' } };
		const plain = await echo.request('/echo', upgrade);
		expect(await plain.json()).toEqual({ method: 'GET' });
		const socket = alxia()
			.all('/s', ({ reply }) => reply(200, 'all'))
			.ws('/s', { message: () => {} });
		// No server to upgrade with: the ws route took it, and answered 426.
		expect((await socket.request('/s', upgrade)).status).toBe(426);
		expect(await (await socket.request('/s')).text()).toBe('all');
	});
});

describe('a wildcard', () => {
	const api = alxia()
		.all('/api/*', ({ request, url, reply }) =>
			reply(200, `${request.method} ${url.pathname}`),
		)
		.get('/api/health', ({ reply }) => reply(200, 'health'));

	test('every method under it reaches it', async () => {
		for (const method of METHODS) {
			const response = await api.request('/api/users/1', { method });
			expect(await response.text()).toBe(`${method} /api/users/1`);
		}
		expect(await (await api.request('/api')).text()).toBe('GET /api');
	});

	test('a literal path under it is its own: its other methods answer 405', async () => {
		expect(await (await api.request('/api/health')).text()).toBe('health');
		const post = await api.request('/api/health', { method: 'POST' });
		expect(post.status).toBe(405);
		expect(post.headers.get('allow')).toBe('GET');
	});
});

describe('middlewares and validate', () => {
	const app = alxia()
		.use((ctx, next) => next({ tenant: ctx.request.headers.get('x-tenant') }))
		.all(
			'/items/:id',
			validate({ params: z.object({ id: z.coerce.number() }) }),
			(_ctx, next) => next({ seen: true }),
			({ params, tenant, seen, request, reply }) =>
				reply(200, { id: params.id, tenant, seen, method: request.method }),
		)
		.all(
			'/notes',
			{ bodyLimit: 16 },
			validate({ body: z.object({ text: z.string() }) }),
			({ body, reply }) => reply(200, body.text),
		);

	test('run before it, typed, for every method', async () => {
		for (const method of ['GET', 'PATCH']) {
			const response = await app.request('/items/7', {
				method,
				headers: { 'x-tenant': 'acme' },
			});
			expect(await response.json()).toEqual({
				id: 7,
				tenant: 'acme',
				seen: true,
				method,
			});
		}
	});

	test("validate refuses what its schema refuses; the options' bodyLimit holds", async () => {
		expect((await app.request('/items/x')).status).toBe(400);
		const note = (text: string) =>
			app.request('/notes', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text }),
			});
		expect(await (await note('hi')).text()).toBe('hi');
		expect((await note('x'.repeat(64))).status).toBe(413);
	});
});

describe('under listen', () => {
	let stop: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await stop?.();
		stop = undefined;
	});

	test("Bun.serve's routes reach it by every method, the explicit route first", async () => {
		const app = alxia()
			.all('/api/*', ({ request, reply }) => reply(200, request.method))
			.get('/api/me', ({ reply }) => reply(200, 'me'));
		const server = app.listen({ port: 0, signals: false });
		stop = () => app.stop(true);
		const at = (path: string, method = 'GET') =>
			fetch(new URL(path, server.url), { method }).then((r) => r.text());
		expect(await at('/api/x', 'DELETE')).toBe('DELETE');
		expect(await at('/api/x', 'PUT')).toBe('PUT');
		expect(await at('/api/me')).toBe('me');
	});
});
