/** What an app reads of a request and sets on its response: cookies, HEAD, parsers, the ip, Vary. */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { vary } from '../reply/headers';
import { alxia } from './alxia';
import type { ResponseCookies } from './types';
import { validate } from './validate';

describe('cookies', () => {
	test('every set-cookie a reply gives in its headers is sent', async () => {
		const headers = new Headers();
		headers.append('set-cookie', 'a=1; Path=/');
		headers.append('set-cookie', 'b=2; Path=/');
		const app = alxia().get('/two', ({ reply, set }) => {
			set.headers.append('set-cookie', 'z=0; Path=/');
			set.cookies.set('c', '3');
			return reply(200, 'ok', { headers });
		});
		const response = await app.request('/two');
		expect(response.headers.getSetCookie()).toEqual([
			'z=0; Path=/',
			'a=1; Path=/',
			'b=2; Path=/',
			'c=3; Path=/; SameSite=Lax',
		]);
	});

	const app = alxia()
		.get(
			'/session',
			validate({ cookies: z.object({ session: z.string() }) }),
			({ cookies, reply }) => reply(200, cookies.session),
		)
		.post('/login', ({ set, reply }) => {
			set.cookies.set('session', 'abc', { httpOnly: true, path: '/' });
			return reply(204);
		});

	test('cookies are validated and set', async () => {
		expect((await app.request('/session')).status).toBe(400);
		const read = await app.request('/session', {
			headers: { cookie: 'session=abc' },
		});
		expect(await read.text()).toBe('abc');
		const login = await app.request('/login', { method: 'POST' });
		expect(login.headers.getSetCookie()[0]).toContain('session=abc');
		expect(login.headers.getSetCookie()[0]).toContain('HttpOnly');
	});
});

describe('set.cookies', () => {
	test('still sets the response cookies, from a middleware and a handler', async () => {
		const app = alxia()
			.derive(({ set }) => {
				expectTypeOf(set.cookies).toEqualTypeOf<ResponseCookies>();
				set.cookies.set('seen', '1', { path: '/' });
			})
			.post('/login', ({ set, reply }) => {
				set.cookies.set('sid', 'abc', { httpOnly: true, path: '/' });
				// What this response set reads back.
				return reply(200, { sid: set.cookies.get('sid') });
			});
		const response = await app.request('/login', { method: 'POST' });
		expect(await response.json()).toEqual({ sid: 'abc' });
		const cookies = response.headers.getSetCookie();
		expect(cookies).toHaveLength(2);
		expect(cookies[0]).toContain('seen=1');
		expect(cookies[1]).toContain('sid=abc');
		expect(cookies[1]).toContain('HttpOnly');
	});

	test('a request cookie is not echoed back as a Set-Cookie', async () => {
		const app = alxia()
			.derive(({ cookies }) => ({ sid: cookies['sid'] }))
			.get('/', ({ reply }) => reply(204));
		const response = await app.request('/', {
			headers: { cookie: 'sid=abc' },
		});
		expect(response.headers.getSetCookie()).toEqual([]);
	});
});

describe('requests', () => {
	test('HEAD runs the GET route and sends no body', async () => {
		const app = alxia().get('/a', ({ reply }) => reply(200, 'body'));
		const response = await app.request('/a', { method: 'HEAD' });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
	});

	test('a body parser the app adds is tried first', async () => {
		const app = alxia()
			.parser('application/csv', async (request) =>
				(await request.text()).split(','),
			)
			.post(
				'/csv',
				validate({ body: z.array(z.string()) }),
				({ body, reply }) => reply(200, body.length),
			);
		const response = await app.request('/csv', {
			method: 'POST',
			headers: { 'content-type': 'application/csv' },
			body: 'a,b,c',
		});
		expect(await response.json()).toBe(3);
	});

	test('the ip is read by the option', async () => {
		const app = alxia({
			ip: (request) => request.headers.get('x-forwarded-for') ?? undefined,
		}).get('/ip', ({ ip, reply }) => reply(200, ip ?? 'none'));
		const response = await app.request('/ip', {
			headers: { 'x-forwarded-for': '10.0.0.1' },
		});
		expect(await response.text()).toBe('10.0.0.1');
	});
});

describe('Vary', () => {
	test("a reply's Vary adds to the one set on set.headers", async () => {
		const app = alxia()
			.derive(({ set }) => {
				vary(set.headers, 'Accept-Language');
				return {};
			})
			.get('/', ({ reply }) =>
				reply(200, 'ok', {
					headers: { vary: 'Accept-Encoding, accept-language', etag: '"1"' },
				}),
			)
			.get('/plain', ({ reply }) => reply(200, 'ok'));
		const response = await app.request('/');
		expect(response.headers.get('vary')).toBe(
			'Accept-Language, Accept-Encoding',
		);
		expect(response.headers.get('etag')).toBe('"1"');
		expect((await app.request('/plain')).headers.get('vary')).toBe(
			'Accept-Language',
		);
	});

	test('`*` replaces the names, and an empty name adds nothing', () => {
		const headers = new Headers({ vary: 'Accept-Language' });
		vary(headers, ' ');
		expect(headers.get('vary')).toBe('Accept-Language');
		vary(headers, '*');
		expect(headers.get('vary')).toBe('*');
		vary(headers, 'Cookie');
		expect(headers.get('vary')).toBe('*');
	});
});
