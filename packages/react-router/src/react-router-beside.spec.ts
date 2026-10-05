import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { matchesSpec } from '@alxia/openapi';
import { isReactRouterRoute, reactRouter } from '@alxia/react-router';
import { makeBase } from '../fixture/base';
import { browser, CLIENT } from '../test/fixture';
import { build, loadBuild, served } from '../test/react-router-helpers';

loadBuild();

describe('beside the app', () => {
	test('a route declared before the catch-all answers first', async () => {
		const response = await served().request('/api/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	test('a route declared after the catch-all answers too, through fetch and listen alike', async () => {
		const app = served().get('/api/after/:id', ({ params, reply }) =>
			reply.ok({ after: params.id }),
		);
		const fetched = await app.request('/api/after/7');
		expect(fetched.status).toBe(200);
		expect(await fetched.json()).toEqual({ after: '7' });
		const server = app.listen({ port: 0 });
		try {
			const listened = await fetch(new URL('/api/after/7', server.url));
			expect(listened.status).toBe(200);
			expect(await listened.json()).toEqual({ after: '7' });
		} finally {
			server.stop(true);
		}
		// The path is chosen before the method: a POST there is the route's
		// 405, not a page.
		expect((await app.request('/api/after/7', { method: 'POST' })).status).toBe(
			405,
		);
	});

	test('the hashed assets are immutable; a missing one is a 404, not a page', async () => {
		const app = served();
		const html = await (await app.request('/', { headers: browser })).text();
		const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
		expect(asset).toBeDefined();
		const response = await app.request(asset as string);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);
		const missing = await app.request('/assets/nope.js');
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: 'not_found' });
	});

	test("public/'s files are served with an hour's cache", async () => {
		const response = await served().request('/robots.txt');
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(await response.text()).toContain('User-agent');
	});

	test('in development the client build is left to Vite', () => {
		const app = makeBase().plugin((app) =>
			reactRouter(app, { build, client: CLIENT, mode: 'development' }),
		);
		expect(app.routes.map((route) => route.path)).not.toContain('/assets/*');
	});

	test('a client folder that is not one is refused at startup', () => {
		expect(() =>
			alxia().plugin((app) =>
				reactRouter(app, { build, client: `${CLIENT}/nowhere` }),
			),
		).toThrow('is not a directory');
	});

	test('client may be a file: URL', () => {
		const app = alxia().plugin((app) =>
			reactRouter(app, { build, client: new URL(`file://${CLIENT}`) }),
		);
		expect(app.routes.map((route) => route.path)).toContain('/assets/*');
	});

	test('isReactRouterRoute names the catch-all and the client files, for matchesSpec to leave out', () => {
		const app = served();
		const ours = app.routes
			.filter(isReactRouterRoute)
			.map((route) => `${route.method} ${route.path}`);
		expect(ours).toEqual([
			'GET /assets/*',
			'GET /robots.txt',
			'GET /*',
			'POST /*',
			'PUT /*',
			'PATCH /*',
			'DELETE /*',
		]);
		const health = { method: 'GET', path: '/api/health' } as const;
		expect(() =>
			matchesSpec(app, [health], { strict: true, exclude: isReactRouterRoute }),
		).not.toThrow();
		expect(() => matchesSpec(app, [health], { strict: true })).toThrow(
			'7 routes have no operation',
		);
	});
});

describe('the build', () => {
	test('a function is called on every request in development', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				mode: 'development',
				build: () => {
					calls += 1;
					return build;
				},
			}),
		);
		await app.request('/', { headers: browser });
		await app.request('/', { headers: browser });
		expect(calls).toBe(2);
	});

	test('and once in production', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				build: async () => {
					calls += 1;
					return build;
				},
			}),
		);
		await Promise.all([
			app.request('/', { headers: browser }),
			app.request('/', { headers: browser }),
		]);
		await app.request('/', { headers: browser });
		expect(calls).toBe(1);
	});

	test('a function that failed is tried again on the next request', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				build: async () => {
					calls += 1;
					if (calls === 1) throw new Error('not built yet');
					return build;
				},
			}),
		);
		expect((await app.request('/', { headers: browser })).status).toBe(500);
		expect((await app.request('/', { headers: browser })).status).toBe(200);
	});
});
