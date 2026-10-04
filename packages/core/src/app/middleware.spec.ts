import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { validate } from './validate';

interface User {
	readonly id: string;
}

/** A `user` from `x-user`, or a 401. */
const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } satisfies User });
});

const Post = z.object({ title: z.string().min(1) });

const post = (
	app: { request: (path: string, init?: RequestInit) => Promise<Response> },
	body: unknown,
	user: string | null,
) =>
	app.request('/posts', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(user === null ? {} : { 'x-user': user }),
		},
		body: JSON.stringify(body),
	});

describe('the order of the middlewares is the order of the request', () => {
	test('auth before validate: a stranger gets 401 before his body is read', async () => {
		const app = alxia().post(
			'/posts',
			auth,
			validate({ body: Post }),
			({ user, body, reply }) => reply(201, { by: user.id, ...body }),
		);
		expect((await post(app, { title: '' }, null)).status).toBe(401);
		expect((await post(app, { title: '' }, 'ada')).status).toBe(400);
		const created = await post(app, { title: 'Hi' }, 'ada');
		expect(created.status).toBe(201);
		expect(await created.json()).toEqual({ by: 'ada', title: 'Hi' });
	});

	test('validate before auth: an invalid body gets 400 before the user is asked', async () => {
		const app = alxia().post(
			'/posts',
			validate({ body: Post }),
			auth,
			({ user, body, reply }) => reply(201, { by: user.id, ...body }),
		);
		const refused = await post(app, { title: '' }, null);
		expect(refused.status).toBe(400);
		expect(await refused.json()).toMatchObject({ error: 'validation' });
		expect((await post(app, { title: 'Hi' }, null)).status).toBe(401);
	});

	test('a refusal is answered by the onRefusal hook in force, as a schema of 0.3 is', async () => {
		const app = alxia()
			.onRefusal((refusal, { reply }) =>
				reply(422, { part: refusal.kind === 'validation' ? refusal.part : '' }),
			)
			.post('/posts', validate({ body: Post }), ({ reply }) => reply(204));
		const refused = await post(app, { title: '' }, null);
		expect(refused.status).toBe(422);
		expect(await refused.json()).toEqual({ part: 'body' });
	});
});

describe('a middleware', () => {
	test('that awaits next() runs around the rest, and sees its response', async () => {
		const seen: number[] = [];
		const timed = defineMiddleware(async (_ctx, next) => {
			const response = await next();
			seen.push(response.status);
			response.headers.set('x-wrapped', 'yes');
			return response;
		});
		const app = alxia().get('/', timed, auth, ({ reply }) => reply(200, 'ok'));
		const response = await app.request('/', { headers: { 'x-user': 'ada' } });
		expect(response.headers.get('x-wrapped')).toBe('yes');
		expect((await app.request('/')).headers.get('x-wrapped')).toBe('yes');
		expect(seen).toEqual([200, 401]);
	});

	test('that returns a reply ends the request; a Response is sent as it is', async () => {
		const closed = defineMiddleware(({ reply }) =>
			reply(503, { error: 'closed' as const }),
		);
		const raw = defineMiddleware(() => new Response('raw', { status: 418 }));
		let ran = false;
		const app = alxia()
			.get('/closed', closed, ({ reply }) => {
				ran = true;
				return reply(200, 'never');
			})
			.get('/raw', raw, ({ reply }) => reply(200, 'never'));
		const response = await app.request('/closed');
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'closed' });
		expect(ran).toBe(false);
		expect(await (await app.request('/raw')).text()).toBe('raw');
	});

	test('inline, each reads what the ones before it added', async () => {
		const app = alxia().get(
			'/:id',
			(_ctx, next) => next({ a: 1 }),
			async ({ a }, next) => next({ b: a + 1 }),
			({ a, b, params, reply }) => reply(200, { a, b, id: params.id }),
		);
		expect(await (await app.request('/x')).json()).toEqual({
			a: 1,
			b: 2,
			id: 'x',
		});
	});

	test('reads the request as it arrived until a validate', async () => {
		const app = alxia().get(
			'/:id',
			({ params, query, headers }, next) =>
				next({ raw: { params, query, agent: headers['x-agent'] } }),
			validate({ params: z.object({ id: z.coerce.number() }) }),
			({ raw, params, reply }) => reply(200, { raw, id: params.id }),
		);
		const response = await app.request('/7?q=1', {
			headers: { 'x-agent': 'spec' },
		});
		expect(await response.json()).toEqual({
			raw: { params: { id: '7' }, query: { q: '1' }, agent: 'spec' },
			id: 7,
		});
	});

	test('that returns nothing without calling next(), or calls it twice, is a 500 naming the route', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = alxia()
				.get('/nothing', async function forgot() {} as never, ({ reply }) =>
					reply(200, 'x'),
				)
				.get(
					'/twice',
					async (_ctx, next) => {
						await next();
						return next();
					},
					({ reply }) => reply(200, 'x'),
				);
			expect((await app.request('/nothing')).status).toBe(500);
			expect(String(error.mock.calls[0]?.[0])).toContain(
				'GET /nothing: a middleware (forgot) returned nothing',
			);
			expect((await app.request('/twice')).status).toBe(500);
			expect(String(error.mock.calls[1]?.[0])).toContain(
				'GET /twice: a middleware called next() twice',
			);
		} finally {
			error.mockRestore();
		}
	});

	test('next() called after the middleware returned throws, and the rest never runs', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		let late: Promise<unknown> | undefined;
		let ran = false;
		try {
			const app = alxia().get(
				'/',
				({ reply }, next) => {
					late = Promise.resolve().then(() => next());
					return reply(202, 'early');
				},
				({ reply }) => {
					ran = true;
					return reply(200, 'late');
				},
			);
			expect((await app.request('/')).status).toBe(202);
			await expect(late).rejects.toThrow(
				'GET /: a middleware called next() after it returned',
			);
			expect(ran).toBe(false);
		} finally {
			error.mockRestore();
		}
	});

	test('a schema in the options, beside middlewares, is refused where the route is declared', () => {
		expect(() =>
			alxia().get(
				'/',
				{ query: z.object({}) } as never,
				validate({}),
				({ reply }) => reply(200, 'x'),
			),
		).toThrow(
			'GET /: the options hold no schema: give validate(…) and responds(…) among the middlewares',
		);
	});

	test('anything else after the options is refused where the route is declared', () => {
		expect(() =>
			alxia().get('/', { bodyLimit: 10 }, 'auth' as never, ({ reply }) =>
				reply(200, 'x'),
			),
		).toThrow(
			'GET /: middleware 1 is not a function: make it with defineMiddleware(), validate() or responds()',
		);
		expect(() => defineMiddleware('auth' as never)).toThrow(
			'defineMiddleware(): the middleware is not a function',
		);
	});

	test('the options hold the bodyLimit, a 413 past it', async () => {
		const app = alxia().post(
			'/upload',
			{ bodyLimit: 4 },
			validate({ body: z.string() }),
			({ body, reply }) => reply(200, body),
		);
		const response = await app.request('/upload', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: 'too long',
		});
		expect(response.status).toBe(413);
	});
});
