import { describe, expectTypeOf, test } from 'bun:test';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import type { AddedOf, Empty, Middleware, Next } from './types';

interface User {
	readonly id: string;
}

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } as User });
});

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
		alxia().get('/', timed, raw, closed, ({ reply }) => reply(200, 'ok'));
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

	test('a middleware typed by the exported Middleware adds nothing, and leaves the context typed', () => {
		const plain: Middleware = (_ctx, next) => next();
		alxia().get('/', plain, (ctx) => {
			expectTypeOf(ctx).not.toBeAny();
			expectTypeOf<AddedOf<ReturnType<Middleware>>>().toEqualTypeOf<Empty>();
			return ctx.reply(200, 'x');
		});
		// The requirement of a route of `use` stays checked behind it.
		const needsUser = defineMiddleware<{ user: User }>()((_ctx, next) =>
			next(),
		);
		// @ts-expect-error no middleware before needsUser adds a `user`
		alxia().get('/', plain, needsUser, ({ reply }) => reply(200, 'x'));
	});
});
