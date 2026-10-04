import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { responds, validate } from './validate';

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

describe('validate', () => {
	test('leaves the raw cookies to the hooks, and gives the validated ones to what follows', async () => {
		const seen: unknown[] = [];
		const app = alxia()
			.onError((_error, { cookies, reply }) => {
				seen.push(cookies);
				return reply(500, { error: 'caught' as const });
			})
			.get(
				'/',
				validate({ cookies: z.object({ n: z.coerce.number() }) }),
				({ cookies }, next) => next({ n: cookies.n }),
				({ n }) => {
					throw new Error(`boom ${n}`);
				},
			);
		const response = await app.request('/', { headers: { cookie: 'n=2' } });
		expect(response.status).toBe(500);
		expect(seen).toEqual([{ n: '2' }]);
	});

	test('declares its schemas on the route, for what documents it', () => {
		const app = alxia().post(
			'/posts',
			{ detail: { summary: 'A post' } },
			auth,
			validate({ body: Post }),
			responds({ 201: Post }),
			({ body, reply }) => reply(201, body),
		);
		expect(app.routes[0]?.schema).toEqual({
			detail: { summary: 'A post' },
			body: Post,
			response: { 201: Post },
		});
	});
});

describe('responds', () => {
	const Strict = z.object({ id: z.string() });

	test('sends a reply as its schema gives it back, and answers one it refuses with a 500', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const app = alxia()
				.get('/ok', responds({ 200: Strict }), ({ reply }) =>
					reply(200, { id: 'a', secret: 'x' } as never),
				)
				.get('/bad', responds({ 200: Strict }), ({ reply }) =>
					reply(200, { id: 1 } as never),
				);
			expect(await (await app.request('/ok')).json()).toEqual({ id: 'a' });
			const bad = await app.request('/bad');
			expect(bad.status).toBe(500);
			expect(await bad.json()).toEqual({ error: 'internal' });
		} finally {
			error.mockRestore();
		}
	});

	test('checks the replies of the middlewares after it, not before', async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const before = alxia().get(
				'/',
				auth,
				responds({ 200: Strict }),
				({ reply }) => reply(200, { id: 'a' }),
			);
			const after = alxia().get(
				'/',
				responds({ 200: Strict }),
				auth,
				({ reply }) => reply(200, { id: 'a' }),
			);
			expect((await before.request('/')).status).toBe(401);
			expect((await after.request('/')).status).toBe(500);
		} finally {
			error.mockRestore();
		}
	});

	test('around a wrap: the reply is checked where it is made, the wrap sees the result', async () => {
		const statuses: number[] = [];
		const watch = defineMiddleware(async (_ctx, next) => {
			const response = await next();
			statuses.push(response.status);
			return response;
		});
		const app = alxia().get(
			'/',
			responds({ 200: Strict }),
			watch,
			({ reply }) => reply(200, { id: 'a', extra: 1 } as never),
		);
		expect(await (await app.request('/')).json()).toEqual({ id: 'a' });
		expect(statuses).toEqual([200]);
	});

	test('skips the body under validateResponses: false, and lets a redirect pass', async () => {
		const app = alxia({ validateResponses: false })
			.get('/', responds({ 200: Strict }), ({ reply }) =>
				reply(200, { id: 1 } as never),
			)
			.get('/away', responds({ 200: Strict }), ({ redirect }) => redirect('/'));
		expect(await (await app.request('/')).json()).toEqual({ id: 1 });
		expect((await app.request('/away')).status).toBe(302);
	});
});

describe('a socket route', () => {
	test('runs its middlewares and validate on the upgrade, then opens', async () => {
		const around: number[] = [];
		const app = alxia().ws(
			'/rooms/:room',
			{ send: z.object({ room: z.string(), by: z.string() }) },
			auth,
			async (_ctx, next) => {
				const response = await next();
				around.push(response.status);
				return response;
			},
			validate({ query: z.object({ v: z.literal('1') }) }),
			{
				open: (socket) =>
					socket.send({
						room: socket.data.params.room,
						by: socket.data.user.id,
					}),
				message: () => {},
			},
		);
		const server = app.listen({ port: 0 });
		try {
			const upgrade = { upgrade: 'websocket' };
			const refused = await app.request('/rooms/lobby?v=1', {
				headers: upgrade,
			});
			expect(refused.status).toBe(401);
			const invalid = await app.request('/rooms/lobby?v=2', {
				headers: { ...upgrade, 'x-user': 'ada' },
			});
			expect(invalid.status).toBe(400);
			const url = new URL('/rooms/lobby?v=1', server.url);
			url.protocol = 'ws:';
			// Bun's WebSocket takes headers; the DOM's type does not say so.
			const socket = new WebSocket(url, {
				headers: { 'x-user': 'ada' },
			} as never);
			const received = await new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			socket.close();
			expect(received).toEqual({ room: 'lobby', by: 'ada' });
			// The 400 went through it, then the upgrade's stand-in response.
			expect(around).toEqual([400, 200]);
		} finally {
			await server.stop(true);
		}
	});
});
