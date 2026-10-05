import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { upstream } from '../test/upstream';
import { proxy } from './index';

type Echo = { method: string; path: string; search: string };

describe('proxy.mount', () => {
	test('forwards every method and path under the prefix, stripped, and nothing else', async () => {
		const up = upstream();
		const app = alxia()
			.get('/local', ({ reply }) => reply(200, 'local'))
			.plugin(proxy.mount('/legacy', up.url));
		const deleted = await app.request('/legacy/orders/9?force=1', {
			method: 'DELETE',
		});
		expect((await deleted.json()) as Echo).toEqual(
			expect.objectContaining({
				method: 'DELETE',
				path: '/orders/9',
				search: '?force=1',
			}),
		);
		expect(((await (await app.request('/legacy')).json()) as Echo).path).toBe(
			'/',
		);
		expect(await (await app.request('/local')).text()).toBe('local');
		expect((await app.request('/legacyish')).status).toBe(404);
		expect((await app.request('/other')).status).toBe(404);
		expect(up.seen.map((seen) => seen.url.pathname)).toEqual([
			'/orders/9',
			'/',
		]);
	});

	test("runs behind the app's middlewares declared before it", async () => {
		const up = upstream();
		const app = alxia()
			.use(async (ctx, next) =>
				ctx.request.headers.get('x-key') === 'k'
					? next()
					: ctx.reply(401, 'no key'),
			)
			.plugin(proxy.mount('/legacy', up.url));
		expect((await app.request('/legacy/x')).status).toBe(401);
		expect(up.seen).toHaveLength(0);
		expect(
			(await app.request('/legacy/x', { headers: { 'x-key': 'k' } })).status,
		).toBe(200);
	});

	test('refuses a prefix that is "/" or ends with "/"', () => {
		expect(() => proxy.mount('/' as '/x', 'http://localhost:1')).toThrow(
			'proxy.mount(): the prefix must start with "/" and not end with one; got "/"',
		);
		expect(() => proxy.mount('/legacy/', 'http://localhost:1')).toThrow(
			'proxy.mount(): the prefix must start with "/" and not end with one; got "/legacy/"',
		);
	});
});

describe('rebasing Location and cookies', () => {
	const redirecting = (location: string, ...cookies: string[]) =>
		upstream(() => {
			const headers = new Headers({ location });
			for (const cookie of cookies) headers.append('set-cookie', cookie);
			return new Response(null, { status: 302, headers });
		});

	test("a path or a URL on the upstream's origin moves under the prefix", async () => {
		const byPath = redirecting('/login?next=%2Fhome#top');
		const app = alxia().plugin(proxy.mount('/legacy', byPath.url));
		expect((await app.request('/legacy/home')).headers.get('location')).toBe(
			'/legacy/login?next=%2Fhome#top',
		);
		const absolute = upstream(
			(request) =>
				new Response(null, {
					status: 301,
					headers: { location: new URL('/account', request.url).href },
				}),
		);
		const mounted = alxia().plugin(proxy.mount('/a', absolute.url));
		expect((await mounted.request('/a')).headers.get('location')).toBe(
			'/a/account',
		);
	});

	test('a location elsewhere, or relative, is left as it is', async () => {
		const elsewhere = redirecting('https://auth.example.com/login');
		const relative = redirecting('next');
		const app = alxia()
			.plugin(proxy.mount('/x', elsewhere.url))
			.plugin(proxy.mount('/y', relative.url));
		expect((await app.request('/x')).headers.get('location')).toBe(
			'https://auth.example.com/login',
		);
		expect((await app.request('/y')).headers.get('location')).toBe('next');
	});

	test("a cookie's Domain naming the upstream is dropped, its Path moved under the prefix", async () => {
		const up = redirecting(
			'/',
			'sid=1; Domain=localhost; Path=/; HttpOnly',
			'pref=dark; Path=/settings; Secure',
			'other=2; Domain=example.com; Path=/',
			'bare=3',
		);
		const response = await alxia()
			.plugin(proxy.mount('/legacy', up.url))
			.request('/legacy');
		expect(response.headers.getSetCookie()).toEqual([
			'sid=1; Path=/legacy; HttpOnly',
			'pref=dark; Path=/legacy/settings; Secure',
			'other=2; Domain=example.com; Path=/legacy',
			'bare=3',
		]);
	});

	test('proxy() rebases only when asked, under the prefix it strips', async () => {
		const up = redirecting('/login', 'sid=1; Path=/');
		const plain = alxia().use('/api', proxy(up.url, { rewrite: '/api' }));
		expect((await plain.request('/api')).headers.get('location')).toBe(
			'/login',
		);
		const rebased = alxia().use(
			'/api',
			proxy(up.url, { rewrite: '/api', rebase: true }),
		);
		const response = await rebased.request('/api');
		expect(response.headers.get('location')).toBe('/api/login');
		expect(response.headers.getSetCookie()).toEqual(['sid=1; Path=/api']);
		const off = alxia().plugin(proxy.mount('/m', up.url, { rebase: false }));
		expect((await off.request('/m')).headers.get('location')).toBe('/login');
	});

	test('a target with a path: only what is under it is rebased', async () => {
		const up = redirecting('/app/inside', 'sid=1; Path=/app');
		const outside = redirecting('/other');
		const app = alxia()
			.plugin(proxy.mount('/p', new URL('/app', up.url)))
			.plugin(proxy.mount('/q', new URL('/app', outside.url)));
		const inside = await app.request('/p');
		expect(inside.headers.get('location')).toBe('/p/inside');
		expect(inside.headers.getSetCookie()).toEqual(['sid=1; Path=/p']);
		expect((await app.request('/q')).headers.get('location')).toBe('/other');
	});
});
