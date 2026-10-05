import { describe, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import type { Reply } from '../reply/reply';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
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
});

describe('validate and responds among the options and middlewares', () => {
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
				// @ts-expect-error a route takes at most 8 middlewares, said on the ninth
				add,
				() => new Response('x'),
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

	test('options, then middlewares, validate and responds among them', () => {
		alxia().post(
			'/posts',
			{ bodyLimit: 1024 },
			auth,
			validate({ body: Post }),
			responds({ 201: Post }),
			({ body, reply }) => {
				expectTypeOf(body).toEqualTypeOf<{ title: string }>();
				return reply(201, body);
			},
		);
	});
});

describe('the forms of 0.3, removed', () => {
	test('a list of middlewares and a schema in the options are compile errors', () => {
		// Never called: only compiled; each throws where it is declared.
		const _removed = () => {
			// @ts-expect-error: a schema is given by validate(…), not the options
			alxia().post('/a', { body: Post }, ({ reply }) => reply(200, 'a'));
			// @ts-expect-error: the middlewares follow the path, not in a list
			alxia().get('/b', [auth], ({ reply }) => reply(200, 'b'));
			// @ts-expect-error: a socket's schema is given by validate(…) too
			alxia().ws('/c', { query: Post }, { message: () => {} });
		};
		expectTypeOf(_removed).toBeFunction();
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

describe('validate and responds', () => {
	test('carry their mark in their type, as defineMiddleware does', () => {
		expectTypeOf(
			validate({ body: Post })['~builtin'],
		).toEqualTypeOf<'validate'>();
		expectTypeOf(
			responds({ 200: Post })['~builtin'],
		).toEqualTypeOf<'responds'>();
	});
});
