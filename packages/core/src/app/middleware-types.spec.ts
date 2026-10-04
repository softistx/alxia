import { describe, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import type { Reply } from '../reply/reply';
import { alxia, type RoutesOf } from './alxia';
import { defineHook, defineWrap } from './define-hook';
import { defineMiddleware } from './define-middleware';
import type { Next } from './types';
import { responds, validate } from './validate';

interface User {
	readonly id: string;
}

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } as User });
});

const Post = z.object({ title: z.string() });

describe('the context a route threads through its middlewares', () => {
	test('eight middlewares accumulate what each adds', () => {
		alxia().get(
			'/',
			(_ctx, next) => next({ a: 1 }),
			({ a }, next) => next({ b: `${a}` }),
			({ b }, next) => next({ c: b.length > 0 }),
			(_ctx, next) => next({ d: 'd' as const }),
			(_ctx, next) => next({ e: [1] }),
			(_ctx, next) => next({ f: null }),
			(_ctx, next) => next({ g: 7n }),
			({ a, g }, next) => next({ h: a + Number(g) }),
			({ a, b, c, d, e, f, g, h, reply }) => {
				expectTypeOf(a).toEqualTypeOf<number>();
				expectTypeOf(b).toEqualTypeOf<string>();
				expectTypeOf(c).toEqualTypeOf<boolean>();
				expectTypeOf(d).toEqualTypeOf<'d'>();
				expectTypeOf(e).toEqualTypeOf<number[]>();
				expectTypeOf(f).toEqualTypeOf<null>();
				expectTypeOf(g).toEqualTypeOf<bigint>();
				expectTypeOf(h).toEqualTypeOf<number>();
				return reply(200, 'ok');
			},
		);
	});

	test('a ninth is refused: the types thread eight', () => {
		const add = defineMiddleware((_ctx, next) => next({ x: 1 }));
		// @ts-expect-error a route takes at most 8 middlewares
		alxia().get('/', add, add, add, add, add, add, add, add, add, ({ reply }) =>
			reply(200, 'x'),
		);
	});

	test('`user` is typed after auth, and not before', () => {
		alxia().get(
			'/',
			auth,
			({ user }, next) => next({ id: user.id }),
			({ id, reply }) => reply(200, id),
		);
		alxia().get(
			'/',
			// @ts-expect-error no middleware before this one added `user`
			({ user }, next) => next({ id: user.id }),
			auth,
			({ reply }) => reply(200, 'x'),
		);
	});

	test('a middleware made with what it requires is refused where it is not given', () => {
		const canPost = defineMiddleware<{ user: User }>()(
			({ user, reply }, next) =>
				user.id === 'banned'
					? reply(403, { error: 'banned' as const })
					: next(),
		);
		alxia().post('/', auth, canPost, ({ user, reply }) => reply(201, user.id));
		// @ts-expect-error canPost reads a `user` no middleware before it adds
		alxia().post('/', canPost, ({ reply }) => reply(201, 'x'));
	});

	test('a middleware may return a reply, a Response, or next() awaited', () => {
		const closed = defineMiddleware(({ reply }) =>
			reply(503, { error: 'closed' as const }),
		);
		const raw = defineMiddleware(() => new Response('raw'));
		const timed = defineMiddleware(async (_ctx, next) => {
			const response = await next();
			expectTypeOf(response).toEqualTypeOf<Next>();
			expectTypeOf(response.headers).toEqualTypeOf<Headers>();
			return response;
		});
		const app = alxia().get('/', timed, raw, closed, ({ reply }) =>
			reply(200, 'ok'),
		);
		type Output = RoutesOf<typeof app>['/']['GET']['output'];
		expectTypeOf<
			Extract<Output, { status: 503 }>['data']['error']
		>().toEqualTypeOf<'closed'>();
	});

	test('a middleware returning anything else is refused', () => {
		// @ts-expect-error a middleware returns next(), a reply or a Response
		defineMiddleware(() => 'nothing');
		alxia().get(
			'/',
			// @ts-expect-error a middleware returns next(), a reply or a Response
			() => undefined,
			({ reply }) => reply(200, 'x'),
		);
	});
});

describe('validate and responds', () => {
	test('validate types what follows it: body, params, query, headers, cookies', () => {
		alxia().patch(
			'/posts/:id',
			validate({
				params: z.object({ id: z.coerce.number() }),
				query: z.object({ draft: z.enum(['yes', 'no']) }),
				headers: z.object({ 'x-trace': z.string() }),
				cookies: z.object({ sid: z.string() }),
				body: Post,
			}),
			({ params, query, headers, cookies, body, reply }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: number }>();
				expectTypeOf(query).toEqualTypeOf<{ draft: 'yes' | 'no' }>();
				expectTypeOf(headers).toEqualTypeOf<{ 'x-trace': string }>();
				expectTypeOf(cookies).toEqualTypeOf<{ sid: string }>();
				expectTypeOf(body).toEqualTypeOf<{ title: string }>();
				return reply(200, body.title);
			},
		);
		alxia().post('/', ({ body, reply }) => {
			expectTypeOf(body).toEqualTypeOf<undefined>();
			return reply(200, 'x');
		});
	});

	test('validate is refused a params schema its path does not declare, or an unknown part', () => {
		alxia().get(
			'/posts',
			// @ts-expect-error "/posts" declares no `id`
			validate({ params: z.object({ id: z.string() }) }),
			({ reply }) => reply(200, 'x'),
		);
		alxia().get(
			'/users/:id',
			// @ts-expect-error "/users/:id" declares no `extra`, optional or not
			validate({
				params: z.object({ id: z.string(), extra: z.string().optional() }),
			}),
			({ reply }) => reply(200, 'x'),
		);
		alxia().ws(
			'/users/:id',
			// @ts-expect-error the same on a socket's upgrade
			validate({
				params: z.object({ id: z.string(), extra: z.string().optional() }),
			}),
			{ message: () => {} },
		);
		// @ts-expect-error "response" is not a part validate() reads
		validate({ response: Post });
	});

	test('responds types the handler reply: a declared status only', () => {
		alxia().get('/', responds({ 200: Post, 404: z.null() }), ({ reply }) => {
			expectTypeOf(reply.notFound).toBeFunction();
			return reply(200, { title: 'x' });
		});
		// @ts-expect-error 201 is not declared
		alxia().get('/', responds({ 200: Post }), ({ reply }) => reply(201, {}));
		// @ts-expect-error 999 is not an HTTP status
		responds({ 999: Post });
	});

	test('the options hold no schema', () => {
		const declare = () =>
			// @ts-expect-error a schema is validate(…) among the middlewares
			alxia().post('/', { body: Post }, auth, ({ reply }) => reply(200, 'x'));
		void declare;
	});

	test('a ninth middleware is refused after options, and on a socket', () => {
		const add = defineMiddleware((_ctx, next) => next({ x: 1 }));
		const declare = () => {
			alxia().get(
				'/',
				{},
				add,
				add,
				add,
				add,
				add,
				add,
				add,
				add,
				add,
				// @ts-expect-error a route takes at most 8 middlewares
				({ reply }) => reply(200, 'x'),
			);
			// @ts-expect-error a socket route takes at most 8 middlewares
			alxia().ws('/', add, add, add, add, add, add, add, add, add, {
				message: () => {},
			});
		};
		void declare;
	});

	test('responds on a socket route is refused: it sends no reply', () => {
		const declare = () => {
			// @ts-expect-error responds() has nothing to check on a socket
			alxia().ws('/', responds({ 200: Post }), {
				message: () => {},
			});
		};
		void declare;
	});

	test('the route table reads the middlewares: their replies, the 400, the 413', () => {
		const app = alxia().post(
			'/posts',
			{ bodyLimit: 1024 },
			auth,
			validate({ body: Post }),
			responds({ 201: Post }),
			({ body, reply }) => reply(201, body),
		);
		type Route = RoutesOf<typeof app>['/posts']['POST'];
		expectTypeOf<Route['input']>().toEqualTypeOf<{
			readonly body: { title: string };
		}>();
		expectTypeOf<Route['output']['status']>().toEqualTypeOf<
			201 | 400 | 401 | 413 | 500
		>();
	});
});

describe('the forms of 0.3, deprecated, still compile', () => {
	test('a list of hooks, a schema, defineHook and defineWrap', () => {
		const canSee = defineHook<{ user: User }>()(({ user, reply }) =>
			user.id === '' ? reply(403, { error: 'forbidden' as const }) : undefined,
		);
		const exclusive = defineWrap(async (_ctx, next) => next());
		alxia()
			.derive(() => ({ user: { id: 'u' } as User }))
			.post('/a', { body: Post }, ({ body, reply }) => reply(200, body.title))
			.post('/b', [canSee, exclusive], { body: Post }, ({ body, reply }) =>
				reply(200, body.title),
			)
			.get('/c', [canSee], ({ user, reply }) => reply(200, user.id))
			.ws('/d', { message: Post }, { message: (_socket, post) => void post })
			.ws('/e', [canSee], {}, { message: (socket) => void socket.data.user });
	});
});

describe('a socket route', () => {
	test('reads what its middlewares add, and validate, on socket.data', () => {
		alxia().ws(
			'/rooms/:room',
			{ send: Post },
			auth,
			validate({ query: z.object({ v: z.string() }) }),
			{
				open: (socket) => {
					expectTypeOf(socket.data.user).toEqualTypeOf<User>();
					expectTypeOf(socket.data.query).toEqualTypeOf<{ v: string }>();
					expectTypeOf(socket.data.params.room).toEqualTypeOf<string>();
					void socket.send({ title: 'hi' });
				},
				message: () => {},
			},
		);
		expectTypeOf<Reply<200, string>>().not.toBeNever();
	});
});
