/**
 * `app.all(path, proxy(url))`: the proxy as one route, every method at its
 * path. Unlike `use(path, proxy(…))`, it shadows nothing: a route at a path
 * of its own, declared after it, stays local. It is in `app.routes`, so the
 * route table and `matchesSpec` see it.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { bearer, createJwt } from '@alxia/jwt';
import { upstream } from '../test/upstream';
import { proxy } from './index';

const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!' });

describe('proxy() as an all route', () => {
	test('forwards every method under the wildcard, the prefix rewritten', async () => {
		const up = upstream();
		const app = alxia().all('/api/*', proxy(up.url, { rewrite: '/api' }));
		for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
			const response = await app.request('/api/users/7?page=2', { method });
			expect(response.status).toBe(200);
		}
		expect(up.seen.map((seen) => seen.method)).toEqual([
			'GET',
			'POST',
			'PUT',
			'DELETE',
			'OPTIONS',
		]);
		expect(up.seen.every((seen) => seen.url.pathname === '/users/7')).toBe(
			true,
		);
		expect(up.seen[0]?.url.search).toBe('?page=2');
		expect(app.routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
			'ALL /api/*',
		]);
	});

	test('a route declared after it at its own path stays local, where use() shadows it', async () => {
		const up = upstream();
		const routed = alxia()
			.all('/api/*', proxy(up.url))
			.get('/api/health', ({ reply }) => reply(200, 'local'));
		expect(await (await routed.request('/api/health')).text()).toBe('local');
		expect(up.seen).toHaveLength(0);
		const used = alxia()
			.use('/api', proxy(up.url))
			.get('/api/health', ({ reply }) => reply(200, 'local'));
		await used.request('/api/health');
		expect(up.seen).toHaveLength(1);
	});

	test("behind the middlewares in force, its options' bodyLimit holding", async () => {
		const up = upstream();
		const app = alxia()
			.use(bearer({ jwt }))
			.all('/api/*', { bodyLimit: 8 }, proxy(up.url));
		expect((await app.request('/api/x', { method: 'POST' })).status).toBe(401);
		expect(up.seen).toHaveLength(0);
		const token = await jwt.sign({ sub: 'u1' });
		const response = await app.request('/api/x', {
			method: 'PATCH',
			headers: { authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(200);
		expect(up.seen.map((seen) => seen.method)).toEqual(['PATCH']);
		const big = await app.request('/api/x', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}` },
			body: 'x'.repeat(64),
		});
		expect(big.status).toBe(413);
		expect(up.seen).toHaveLength(1);
	});

	test('a HEAD reaches the upstream as a HEAD, answered without a body', async () => {
		const up = upstream();
		const app = alxia().all('/files/*', proxy(up.url));
		const response = await app.request('/files/a.txt', { method: 'HEAD' });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
		expect(up.seen.map((seen) => seen.method)).toEqual(['HEAD']);
	});
});
