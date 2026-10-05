import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { serve, upstream } from '../test/upstream';
import { proxy } from './index';

type Echo = { headers: Record<string, string> };

const headersOf = async (response: Response) =>
	((await response.json()) as Echo).headers;

describe('hop-by-hop headers', () => {
	test('are stripped from the request: the list, proxy-*, and what Connection names', async () => {
		const up = upstream();
		const app = alxia().use(proxy(up.url));
		const headers = await headersOf(
			await app.request('/', {
				headers: {
					connection: 'keep-alive, x-secret-hop',
					'keep-alive': 'timeout=5',
					te: 'trailers',
					trailer: 'x-checksum',
					upgrade: 'h2c',
					'proxy-authorization': 'Basic Zm9vOmJhcg==',
					'proxy-connection': 'keep-alive',
					'x-secret-hop': 'local only',
					'x-kept': 'end to end',
				},
			}),
		);
		for (const name of [
			'keep-alive',
			'te',
			'trailer',
			'upgrade',
			'proxy-authorization',
			'proxy-connection',
			'x-secret-hop',
		]) {
			expect(headers[name]).toBeUndefined();
		}
		expect(headers['x-kept']).toBe('end to end');
	});

	test('are stripped from the response', async () => {
		const up = upstream(
			() =>
				new Response('ok', {
					headers: {
						connection: 'x-internal',
						'x-internal': 'upstream only',
						'keep-alive': 'timeout=5',
						'proxy-authenticate': 'Basic',
						upgrade: 'h2c',
						'x-kept': 'yes',
					},
				}),
		);
		const response = await alxia().use(proxy(up.url)).request('/');
		for (const name of [
			'x-internal',
			'keep-alive',
			'proxy-authenticate',
			'upgrade',
		]) {
			expect(response.headers.get(name)).toBeNull();
		}
		expect(response.headers.get('x-kept')).toBe('yes');
	});

	test('several Set-Cookie headers stay several', async () => {
		const up = upstream(() => {
			const headers = new Headers();
			headers.append('set-cookie', 'a=1; Path=/');
			headers.append('set-cookie', 'b=2; Path=/');
			return new Response('ok', { headers });
		});
		const response = await alxia().use(proxy(up.url)).request('/');
		expect(response.headers.getSetCookie()).toEqual([
			'a=1; Path=/',
			'b=2; Path=/',
		]);
	});
});

describe('x-forwarded-* and forwarded', () => {
	test('the peer is appended to X-Forwarded-For; proto and host are set as the app received them', async () => {
		const up = upstream();
		const url = serve(alxia().use(proxy(up.url, { forwarded: true })));
		const headers = await headersOf(
			await fetch(url, {
				headers: {
					'x-forwarded-for': '203.0.113.9',
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'forged.example',
					forwarded: 'for=203.0.113.9',
				},
			}),
		);
		expect(headers['x-forwarded-for']).toBe('203.0.113.9, 127.0.0.1');
		expect(headers['x-forwarded-proto']).toBe('http');
		expect(headers['x-forwarded-host']).toBe(url.host);
		expect(headers['forwarded']).toBe(
			`for=203.0.113.9, for=127.0.0.1;host="${url.host}";proto=http`,
		);
	});

	test('without a server, the app ip is the one appended', async () => {
		const up = upstream();
		const app = alxia({ ip: () => '198.51.100.4' }).use(proxy(up.url));
		const headers = await headersOf(await app.request('/'));
		expect(headers['x-forwarded-for']).toBe('198.51.100.4');
	});

	test('trustForwarded keeps the proto and host a proxy in front set', async () => {
		const up = upstream();
		const app = alxia().use(proxy(up.url, { trustForwarded: true }));
		const headers = await headersOf(
			await app.request('/', {
				headers: {
					'x-forwarded-proto': 'https',
					'x-forwarded-host': 'api.example.com',
				},
			}),
		);
		expect(headers['x-forwarded-proto']).toBe('https');
		expect(headers['x-forwarded-host']).toBe('api.example.com');
	});

	test('xForwarded: false sets none of them', async () => {
		const up = upstream();
		const app = alxia().use(proxy(up.url, { xForwarded: false }));
		const headers = await headersOf(await app.request('/'));
		expect(headers['x-forwarded-for']).toBeUndefined();
		expect(headers['x-forwarded-proto']).toBeUndefined();
		expect(headers['x-forwarded-host']).toBeUndefined();
		expect(headers['forwarded']).toBeUndefined();
	});
});

describe('Host', () => {
	test("is the upstream's by default, the client's with preserveHost", async () => {
		const up = upstream();
		const sent = { headers: { host: 'public.example.com' } };
		const byDefault = await headersOf(
			await alxia().use(proxy(up.url)).request('/', sent),
		);
		expect(byDefault['host']).toBe(up.url.host);
		expect(byDefault['x-forwarded-host']).toBe('public.example.com');
		const preserved = await headersOf(
			await alxia()
				.use(proxy(up.url, { preserveHost: true }))
				.request('/', sent),
		);
		expect(preserved['host']).toBe('public.example.com');
	});
});

describe('headers options', () => {
	test('add, remove and compute request headers, then a function sees them all', async () => {
		const up = upstream();
		const app = alxia().use(
			proxy(up.url, {
				headers: {
					request: {
						'x-gateway': 'alxia',
						cookie: null,
						'x-path': (ctx) => ctx.url.pathname,
						'x-left': () => undefined,
					},
				},
			}),
		);
		const headers = await headersOf(
			await app.request('/where', {
				headers: { cookie: 'sid=1', 'x-left': 'as is' },
			}),
		);
		expect(headers['x-gateway']).toBe('alxia');
		expect(headers['cookie']).toBeUndefined();
		expect(headers['x-path']).toBe('/where');
		expect(headers['x-left']).toBe('as is');
	});

	test('response headers are edited after the upstream answered', async () => {
		const up = upstream(
			() =>
				new Response('ok', {
					headers: { server: 'legacy/1.0', 'x-powered-by': 'php' },
				}),
		);
		const app = alxia().use(
			proxy(up.url, {
				headers: {
					response: (headers) => {
						headers.delete('x-powered-by');
						headers.set('server', 'gateway');
					},
				},
			}),
		);
		const response = await app.request('/');
		expect(response.headers.get('server')).toBe('gateway');
		expect(response.headers.get('x-powered-by')).toBeNull();
	});
});
