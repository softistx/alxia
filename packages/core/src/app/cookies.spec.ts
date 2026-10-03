import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { type AnyAlxia, alxia } from './alxia';
import type { ResponseCookies } from './types';

/** A schema written by hand: a `visits` cookie, as a number. */
function visits(): StandardSchemaV1<unknown, { visits: number }> {
	return {
		'~standard': {
			version: 1,
			vendor: 'hand',
			validate: (value) => {
				const raw = (value as Record<string, string>)['visits'];
				const number = Number(raw);
				return raw !== undefined && Number.isInteger(number)
					? { value: { visits: number } }
					: { issues: [{ message: 'Expected visits', path: ['visits'] }] };
			},
		},
	};
}

describe("a hook reads the request's cookies", () => {
	test('a derive reads a request cookie from ctx.cookies', async () => {
		const app = alxia()
			.derive(({ cookies }) => {
				expectTypeOf(cookies).toEqualTypeOf<Readonly<Record<string, string>>>();
				return { session: cookies['sid'] ?? null };
			})
			.get('/me', ({ session, reply }) => reply(200, { session }));
		const signed = await app.request('/me', {
			headers: { cookie: 'sid=abc; theme=dark' },
		});
		expect(await signed.json()).toEqual({ session: 'abc' });
		const anonymous = await app.request('/me');
		expect(await anonymous.json()).toEqual({ session: null });
	});

	test('set.cookies.get reads the response, not the request: the trap', async () => {
		const app = alxia()
			.derive(({ set }) => ({ fromResponse: set.cookies.get('sid') }))
			.get('/trap', ({ fromResponse, reply }) => reply(200, { fromResponse }));
		const response = await app.request('/trap', {
			headers: { cookie: 'sid=abc' },
		});
		// The map is the response's: empty when the request starts.
		expect(await response.json()).toEqual({ fromResponse: null });
	});

	test('wrap, onError and onRefusal read them too', async () => {
		const seen: string[] = [];
		const app = alxia()
			.wrap(({ cookies }, next) => {
				seen.push(`wrap:${cookies['sid']}`);
				return next();
			})
			.onError((_error, { cookies, reply }) =>
				reply(500, { sid: cookies['sid'] ?? null }),
			)
			.onRefusal((_refusal, { cookies, reply }) =>
				reply(400, { sid: cookies['sid'] ?? null }),
			)
			.get('/boom', () => {
				throw new Error('boom');
			})
			.get('/n', { query: z.object({ n: z.string() }) }, ({ reply }) =>
				reply(200, 'ok'),
			);
		const headers = { cookie: 'sid=abc' };
		const failed = await app.request('/boom', { headers });
		expect(await failed.json()).toEqual({ sid: 'abc' });
		const refused = await app.request('/n', { headers });
		expect(refused.status).toBe(400);
		expect(await refused.json()).toEqual({ sid: 'abc' });
		expect(seen).toEqual(['wrap:abc', 'wrap:abc']);
	});

	test('a route without a cookies schema gives its handler the same map', async () => {
		const app = alxia().get('/raw', ({ cookies, reply }) => {
			expectTypeOf(cookies).toEqualTypeOf<Readonly<Record<string, string>>>();
			return reply(200, cookies);
		});
		const response = await app.request('/raw', {
			headers: { cookie: 'a=1; b=2' },
		});
		expect(await response.json()).toEqual({ a: '1', b: '2' });
		expect(await (await app.request('/raw')).json()).toEqual({});
	});

	test('a derive returning cookies replaces them for what follows', async () => {
		const app = alxia()
			.derive(() => ({ cookies: { sid: 'forced' } }))
			.get('/forced', ({ cookies, reply }) => reply(200, cookies));
		const response = await app.request('/forced', {
			headers: { cookie: 'sid=abc' },
		});
		expect(await response.json()).toEqual({ sid: 'forced' });
	});

	test('the map is read-only in the types', () => {
		alxia().derive((ctx) => {
			// @ts-expect-error: the request's cookies are read, not written
			ctx.cookies['sid'] = 'x';
			// @ts-expect-error: and not replaced
			ctx.cookies = {};
		});
	});
});

describe('a route with a cookies schema', () => {
	const app = alxia()
		.derive(({ cookies }) => ({ raw: cookies['visits'] ?? null }))
		.onError((_error, { cookies, reply }) => reply(500, { cookies }))
		.get('/visits', { cookies: visits() }, ({ cookies, raw, reply }) => {
			expectTypeOf(cookies).toEqualTypeOf<{ visits: number }>();
			return reply(200, { visits: cookies.visits, raw });
		})
		.get('/after', { cookies: visits() }, () => {
			throw new Error('after validation');
		});

	test('still gives its handler the validated values', async () => {
		const response = await app.request('/visits', {
			headers: { cookie: 'visits=3' },
		});
		expect(await response.json()).toEqual({ visits: 3, raw: '3' });
	});

	test('still refuses what its schema refuses', async () => {
		const response = await app.request('/visits', {
			headers: { cookie: 'visits=many' },
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: 'validation',
			issues: [{ target: 'cookies' }],
		});
	});

	test('leaves the hooks the cookies as they arrived, past validation too', async () => {
		const response = await app.request('/after', {
			headers: { cookie: 'visits=3' },
		});
		// onError reads strings, as its type says, not the schema's number.
		expect(await response.json()).toEqual({ cookies: { visits: '3' } });
	});
});

describe('set.cookies', () => {
	test('still sets the response cookies, from a hook and a handler', async () => {
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

describe('a socket', () => {
	/** The `socket.data.cookies` a socket at `path` sends back on open. */
	async function opened(app: AnyAlxia, path: string): Promise<unknown> {
		const server = app.listen({ port: 0 });
		try {
			const url = new URL(path, server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url, {
				headers: { cookie: 'visits=3; a=b' },
			} as never);
			const data = await new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			socket.close();
			return data;
		} finally {
			await app.stop(true);
		}
	}

	test('reads the request map without a schema', async () => {
		const app = alxia().ws(
			'/raw',
			{},
			{
				open: (socket) => void socket.send(socket.data.cookies),
				message: () => {},
			},
		);
		expect(await opened(app, '/raw')).toEqual({ visits: '3', a: 'b' });
	});

	test('reads the validated values with one', async () => {
		const app = alxia().ws(
			'/visits',
			{ cookies: visits() },
			{
				open: (socket) => {
					expectTypeOf(socket.data.cookies).toEqualTypeOf<{ visits: number }>();
					void socket.send(socket.data.cookies);
				},
				message: () => {},
			},
		);
		expect(await opened(app, '/visits')).toEqual({ visits: 3 });
	});
});
