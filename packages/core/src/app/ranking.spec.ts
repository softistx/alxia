import { describe, expect, test } from 'bun:test';
import { alxia } from './alxia';

/**
 * Each case through `app.request` and through `listen`, where Bun.serve's
 * own router chooses the path: the two must answer alike, in either order
 * of declaration. `expected` is what Bun.serve was measured to choose
 * (Bun 1.4.2); `null` is no route.
 */
const cases: {
	readonly name: string;
	readonly routes: readonly string[];
	readonly expected: Readonly<Record<string, string | null>>;
}[] = [
	{
		name: 'a literal, then a parameter, then a wildcard',
		routes: ['/u/me', '/u/:id', '/u/*'],
		expected: { '/u/me': '/u/me', '/u/7': '/u/:id', '/u/7/x': '/u/*' },
	},
	{
		name: 'a longer wildcard before a shorter one',
		routes: ['/*', '/a/*'],
		expected: { '/a/x': '/a/*', '/a/x/y': '/a/*', '/b': '/*', '/': '/*' },
	},
	{
		name: 'the first segment that differs decides',
		routes: ['/a/:id', '/:x/b'],
		expected: { '/a/b': '/a/:id', '/a/c': '/a/:id', '/z/b': '/:x/b' },
	},
	{
		name: 'a wildcard after a parameter needs its slash',
		routes: ['/a/:id/*', '/a/*'],
		expected: { '/a/1/x': '/a/:id/*', '/a/1/': '/a/:id/*', '/a/1': '/a/*' },
	},
	{
		name: 'a trailing slash is a segment',
		routes: ['/a', '/a/*', '/s/'],
		expected: { '/a': '/a', '/a/': '/a/*', '/s/': '/s/' },
	},
	{
		name: 'a later segment decides between two parameters',
		routes: ['/:x/b/c', '/a/:y/:z'],
		expected: { '/a/b/c': '/a/:y/:z', '/q/b/c': '/:x/b/c' },
	},
	{
		name: 'a literal that leads nowhere gives way',
		routes: ['/a/b/c', '/:x/b/d'],
		expected: { '/a/b/d': '/:x/b/d', '/a/b/c': '/a/b/c' },
	},
	{
		name: 'a literal before a parameter, even ahead of a wildcard',
		routes: ['/a/:id/c', '/a/b/*', '/a/*', '/:x/b/c'],
		expected: {
			'/a/b/c': '/a/b/*',
			'/a/x/c': '/a/:id/c',
			'/a/x/d': '/a/*',
			'/z/b/c': '/:x/b/c',
		},
	},
	{
		name: 'a route declared after the catch-all',
		routes: ['/*', '/api/after/:x'],
		expected: {
			'/api/after/x': '/api/after/:x',
			'/api/after': '/*',
			'/api/after/x/y': '/*',
		},
	},
	{
		name: 'parameters of other names share their rank',
		routes: ['/:a/*', '/:b/c', '/*'],
		expected: {
			'/q/c': '/:b/c',
			'/q/d': '/:a/*',
			'/q/c/': '/:a/*',
			'/q': '/*',
		},
	},
	{
		name: 'the root before the catch-all',
		routes: ['/*', '/'],
		expected: { '/': '/', '/x': '/*' },
	},
	{
		name: 'case and escapes are compared as sent',
		routes: ['/caf%C3%A9', '/:x'],
		expected: { '/caf%C3%A9': '/caf%C3%A9', '/caf%c3%a9': '/:x', '/A': '/:x' },
	},
	{
		name: 'with no strict match, a trailing slash is forgiven',
		routes: ['/a', '/a/:id', '/f/*'],
		expected: { '/a/': '/a', '/a/1/': '/a/:id', '/f': '/f/*', '/b': null },
	},
];

function appOf(routes: readonly string[]) {
	const app = alxia();
	for (const path of routes) {
		app.get(path as '/', ({ params, reply }) =>
			reply(200, { route: path, params }),
		);
	}
	return app;
}

async function answer(response: Response) {
	return { status: response.status, body: await response.text() };
}

describe('fetch ranks routes as listen does', () => {
	for (const { name, routes, expected } of cases) {
		for (const order of [routes, [...routes].reverse()]) {
			test(`${name}: ${order.join(', ')}`, async () => {
				const app = appOf(order);
				const server = app.listen({ port: 0 });
				try {
					for (const [url, route] of Object.entries(expected)) {
						const viaFetch = await answer(await app.request(url));
						const viaListen = await answer(
							await fetch(new URL(url, server.url)),
						);
						expect({ url, ...viaFetch }).toEqual({ url, ...viaListen });
						const chosen =
							viaFetch.status === 200 ? JSON.parse(viaFetch.body).route : null;
						expect({ url, route: chosen }).toEqual({ url, route });
					}
				} finally {
					await app.stop(true);
				}
			});
		}
	}

	test('the path is chosen before the method', async () => {
		const app = alxia()
			.get('/users/:id', ({ reply }) => reply(200, 'one'))
			.post('/users/me', ({ reply }) => reply(200, 'me'));
		const server = app.listen({ port: 0 });
		try {
			for (const method of ['GET', 'HEAD', 'POST']) {
				const viaFetch = await app.request('/users/me', { method });
				const viaListen = await fetch(new URL('/users/me', server.url), {
					method,
				});
				// Bun.serve drops the body of a HEAD's answer by itself.
				expect([
					method,
					viaFetch.status,
					viaFetch.headers.get('allow'),
				]).toEqual([method, viaListen.status, viaListen.headers.get('allow')]);
			}
			expect((await app.request('/users/me')).status).toBe(405);
			expect((await app.request('/users/me')).headers.get('allow')).toBe(
				'POST',
			);
		} finally {
			await app.stop(true);
		}
	});

	test('a page that ranks first is answered 404 by fetch', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const app = alxia()
			.get('/*', ({ reply }) => reply(200, 'catch-all'))
			.page('/', bundle);
		const server = app.listen({ port: 0 });
		try {
			const page = await fetch(server.url);
			expect(page.headers.get('content-type')).toContain('text/html');
			expect((await app.request('/')).status).toBe(404);
			expect(await (await app.request('/x')).text()).toBe('catch-all');
		} finally {
			await app.stop(true);
		}
	});
});
