/**
 * `app.all` is typed as every route method: the same middleware ladder,
 * each middleware checked against the context in force, `validate` and
 * `responds`, the options form, the path's parameters, and the app
 * returned unchanged in type.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';
import { defineRoutes } from './define-plugin';
import { responds, validate } from './validate';

const auth = defineMiddleware(({ request, reply }, next) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthorized' as const });
	return next({ user: { id } });
});
const needsUser = defineMiddleware<{ user: { id: string } }>()(
	({ user }, next) => next({ owner: user.id }),
);

describe('app.all, typed as a route', () => {
	test('the ladder threads what each middleware adds, after its options', () => {
		const base = alxia().decorate({ db: 'db' });
		const app = base
			.fork()
			.all(
				'/items/:id',
				{ bodyLimit: 1024, detail: { summary: 'Any method' } },
				auth,
				needsUser,
				({ params, user, owner, db, reply }) => {
					expectTypeOf(params.id).toEqualTypeOf<string>();
					expectTypeOf(user).toEqualTypeOf<{ id: string }>();
					expectTypeOf(owner).toEqualTypeOf<string>();
					expectTypeOf(db).toEqualTypeOf<'db'>();
					return reply(200, owner);
				},
			);
		expectTypeOf(app).toEqualTypeOf<typeof base>();
		expect(app.routes[0]?.schema.detail?.summary).toBe('Any method');
	});

	test('validate types what follows it; responds checks the replies', () => {
		alxia().all(
			'/notes/:id',
			validate({
				params: z.object({ id: z.coerce.number() }),
				body: z.object({ text: z.string() }),
			}),
			responds({ 200: z.object({ id: z.number() }) }),
			({ params, body, reply }) => {
				expectTypeOf(params).toEqualTypeOf<{ id: number }>();
				expectTypeOf(body).toEqualTypeOf<{ text: string }>();
				return reply(200, { id: params.id });
			},
		);
		alxia().all(
			'/notes',
			responds({ 200: z.object({ id: z.number() }) }),
			// @ts-expect-error 201 is not declared
			({ reply }) => reply(201, { id: 1 }),
		);
	});

	test('a middleware reading what the context does not give is refused', () => {
		alxia().all(
			'/',
			// @ts-expect-error the app gives no `user` before it
			needsUser,
			({ reply }) => reply(200, 'x'),
		);
		alxia().all(
			'/posts',
			// @ts-expect-error "/posts" declares no `id`
			validate({ params: z.object({ id: z.string() }) }),
			({ reply }) => reply(200, 'x'),
		);
		expect(() =>
			// @ts-expect-error a schema is validate(…) among the middlewares
			alxia().all('/', { body: z.string() }, ({ reply }) => reply(200, 'x')),
		).toThrow('ALL /: the options hold no schema (body)');
	});

	test('a prefix is read in the path; defineRoutes and a group take it too', () => {
		alxia({ prefix: '/api' }).all('/:id/*', ({ params, reply }) => {
			expectTypeOf(params.id).toEqualTypeOf<string>();
			expectTypeOf(params['*']).toEqualTypeOf<string>();
			return reply(200, 'x');
		});
		const routes = defineRoutes('/r').all('/:id', ({ params, reply }) =>
			reply(200, params.id),
		);
		expectTypeOf(routes).toEqualTypeOf<ReturnType<typeof defineRoutes<'/r'>>>();
		alxia()
			.derive(() => ({ tenant: 't' }))
			.group('/g', (g) =>
				g.all('/*', ({ tenant, reply }) => reply(200, tenant)),
			);
	});
});
