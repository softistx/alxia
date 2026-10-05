import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { upstream } from '../test/upstream';
import { proxy } from './index';

interface Echo {
	method: string;
	path: string;
	search: string;
	headers: Record<string, string>;
	body: string;
}

describe('forwarding', () => {
	test('the method, the body and the query string reach the upstream', async () => {
		const up = upstream();
		const app = alxia().use('/api', proxy(up.url.href));
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'QUERY']) {
			const response = await app.request('/api/users/7?a=1&a=2&b=%20x', {
				method,
				body: `body of ${method}`,
				headers: { 'content-type': 'text/plain' },
			});
			expect(response.status).toBe(200);
			const echo = (await response.json()) as Echo;
			expect(echo.method).toBe(method);
			expect(echo.path).toBe('/api/users/7');
			expect(echo.search).toBe('?a=1&a=2&b=%20x');
			expect(echo.body).toBe(`body of ${method}`);
			expect(echo.headers['content-type']).toBe('text/plain');
		}
	});

	test('GET and HEAD carry no body; a HEAD answer has none', async () => {
		const up = upstream();
		const app = alxia().use(proxy(up.url));
		const got = await app.request('/x');
		expect(((await got.json()) as Echo).method).toBe('GET');
		const head = await app.request('/x', { method: 'HEAD' });
		expect(head.status).toBe(200);
		expect(await head.text()).toBe('');
		expect(up.seen.at(-1)?.method).toBe('HEAD');
	});

	test('the status, the headers and the body come back as the upstream sent them', async () => {
		const up = upstream(
			() =>
				new Response('nope', {
					status: 418,

					headers: { 'x-from': 'upstream' },
				}),
		);
		const response = await alxia().use(proxy(up.url)).request('/');
		expect(response.status).toBe(418);
		expect(response.headers.get('x-from')).toBe('upstream');
		expect(await response.text()).toBe('nope');
	});

	test('a redirect is passed back, never followed', async () => {
		const up = upstream(
			() =>
				new Response(null, {
					status: 302,
					headers: { location: '/elsewhere' },
				}),
		);
		const response = await alxia().use(proxy(up.url)).request('/');
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/elsewhere');
	});

	test('a compressed body is passed through as it is, never decoded', async () => {
		const gzipped = Bun.gzipSync('hello, compressed world');
		const up = upstream(
			() =>
				new Response(gzipped, {
					headers: { 'content-encoding': 'gzip', 'content-type': 'text/plain' },
				}),
		);
		const response = await alxia().use(proxy(up.url)).request('/');
		expect(response.headers.get('content-encoding')).toBe('gzip');
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect(bytes).toEqual(new Uint8Array(gzipped));
	});
});

describe('rewrite', () => {
	test('a prefix is stripped, compared without case, the query kept', async () => {
		const up = upstream();
		const app = alxia().use('/api', proxy(up.url, { rewrite: '/api' }));
		const at = async (path: string) => {
			const echo = (await (await app.request(path)).json()) as Echo;
			return echo.path + echo.search;
		};
		expect(await at('/api/users?x=1')).toBe('/users?x=1');
		expect(await at('/api')).toBe('/');
		expect(await at('/API/users')).toBe('/users');
	});

	test('a function rewrites the path', async () => {
		const up = upstream();
		const app = alxia().use(
			'/v1',
			proxy(up.url, {
				rewrite: (path) => path.replace(/^\/v1/, '/internal/v2'),
			}),
		);
		const echo = (await (await app.request('/v1/items?q=a')).json()) as Echo;
		expect(echo.path).toBe('/internal/v2/items');
		expect(echo.search).toBe('?q=a');
	});

	test("the target's path is the base of every upstream path", async () => {
		const up = upstream();
		const app = alxia().use(
			'/api',
			proxy(new URL('/base/', up.url), { rewrite: '/api' }),
		);
		const echo = (await (await app.request('/api/users')).json()) as Echo;
		expect(echo.path).toBe('/base/users');
	});
});

describe('bodyLimit', () => {
	test("the proxy's own counts the streamed body: a 413", async () => {
		const up = upstream();
		const app = alxia().use(proxy(up.url, { bodyLimit: 8 }));
		const ok = await app.request('/', { method: 'POST', body: '12345678' });
		expect(ok.status).toBe(200);
		const declared = await app.request('/', {
			method: 'POST',
			body: '123456789',
		});
		expect(declared.status).toBe(413);
		const streamed = await app.request('/', {
			method: 'POST',
			body: new Blob(['12345', '67890']).stream(),
		});
		expect(streamed.status).toBe(413);
		expect(await streamed.json()).toMatchObject({ error: 'content_too_large' });
	});

	test("a route's bodyLimit is counted as the body streams through", async () => {
		const up = upstream();
		const app = alxia().post('/upload', { bodyLimit: 4 }, proxy(up.url), () => {
			throw new Error('never reached');
		});
		const response = await app.request('/upload', {
			method: 'POST',
			body: new Blob(['123', '456']).stream(),
		});
		expect(response.status).toBe(413);
	});
});
