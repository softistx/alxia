import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { refusalOf } from '../errors/errors';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { type AnyAlxia, alxia } from './alxia';
import { validate } from './validate';

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

describe("a middleware reads the request's cookies", () => {
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

	test('a try/catch middleware reads them, answering an error or a refusal', async () => {
		const seen: string[] = [];
		const app = alxia()
			.use(async ({ cookies, reply }, next) => {
				seen.push(`in:${cookies['sid']}`);
				try {
					return await next();
				} catch (error) {
					const sid = cookies['sid'] ?? null;
					return refusalOf(error) === undefined
						? reply(500, { sid })
						: reply(400, { sid });
				}
			})
			.get('/boom', () => {
				throw new Error('boom');
			})
			.get(
				'/n',
				validate({ query: z.object({ n: z.string() }) }),
				({ reply }) => reply(200, 'ok'),
			);
		const headers = { cookie: 'sid=abc' };
		const failed = await app.request('/boom', { headers });
		expect(failed.status).toBe(500);
		expect(await failed.json()).toEqual({ sid: 'abc' });
		const refused = await app.request('/n', { headers });
		expect(refused.status).toBe(400);
		expect(await refused.json()).toEqual({ sid: 'abc' });
		expect(seen).toEqual(['in:abc', 'in:abc']);
	});
});

describe("a route's cookies without a schema", () => {
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
		.use(async ({ cookies, reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (refusalOf(error) !== undefined) throw error;
				return reply(500, { cookies });
			}
		})
		.get(
			'/visits',
			validate({ cookies: visits() }),
			({ cookies, raw, reply }) => {
				expectTypeOf(cookies).toEqualTypeOf<{ visits: number }>();
				return reply(200, { visits: cookies.visits, raw });
			},
		)
		.get(
			'/order',
			({ cookies }, next) => next({ before: cookies['visits'] }),
			validate({ cookies: visits() }),
			({ cookies }, next) => next({ after: cookies.visits }),
			({ before, after, reply }) => {
				expectTypeOf(before).toEqualTypeOf<string | undefined>();
				expectTypeOf(after).toEqualTypeOf<number>();
				return reply(200, { before, after });
			},
		)
		.get('/after', validate({ cookies: visits() }), () => {
			throw new Error('after validation');
		});

	test('still gives its handler the validated values', async () => {
		const response = await app.request('/visits', {
			headers: { cookie: 'visits=3' },
		});
		expect(await response.json()).toEqual({ visits: 3, raw: '3' });
	});

	test('a middleware reads them raw before validate, validated after', async () => {
		const response = await app.request('/order', {
			headers: { cookie: 'visits=3' },
		});
		expect(await response.json()).toEqual({ before: '3', after: 3 });
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

	test('leaves a middleware before validate the cookies as they arrived, past validation too', async () => {
		const response = await app.request('/after', {
			headers: { cookie: 'visits=3' },
		});
		// The catching middleware reads strings, as its type says, not the schema's number.
		expect(await response.json()).toEqual({ cookies: { visits: '3' } });
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
		const app = alxia().ws('/visits', validate({ cookies: visits() }), {
			open: (socket) => {
				expectTypeOf(socket.data.cookies).toEqualTypeOf<{ visits: number }>();
				void socket.send(socket.data.cookies);
			},
			message: () => {},
		});
		expect(await opened(app, '/visits')).toEqual({ visits: 3 });
	});
});
