/**
 * The endpoint behind the app's middlewares: what one given to `use` adds
 * is in each resolver's context, typed; one that answers — a 401 — answers
 * before Yoga runs; and one that catches an error around `next()` answers
 * for the endpoint too.
 */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type NextFunction } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { type GraphQLContext, graphql } from './graphql';

/** A guard as `bearer()` is one: `viewer` for what follows, or a 401. */
const guard = ({ request, reply }: BaseContext, next: NextFunction) =>
	request.headers.get('authorization') === 'Bearer ok'
		? next({ viewer: 'ok' })
		: reply(401, { error: 'unauthorized' as const });

/** A fresh app each time: an app is built in place. */
const guarded = () => alxia({ prefix: '/api' }).use(guard);

const schema = createSchema<GraphQLContext<ReturnType<typeof guarded>>>({
	typeDefs: /* GraphQL */ 'type Query { me: String! }',
	resolvers: {
		Query: {
			me: (_, __, context) => {
				expectTypeOf(context.viewer).toEqualTypeOf<string>();
				return context.viewer;
			},
		},
	},
});

const post = (
	target: { request: (path: string, init: RequestInit) => Promise<Response> },
	path: string,
	headers: Record<string, string> = {},
) =>
	target.request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query: '{ me }' }),
	});

describe('graphql behind middlewares', () => {
	test('a guard given to use answers 401, else resolvers read what it adds', async () => {
		const app = guarded().plugin((app) =>
			graphql(app, { schema, logging: false }),
		);
		expect((await post(app, '/api/graphql')).status).toBe(401);
		const ok = await post(app, '/api/graphql', { authorization: 'Bearer ok' });
		expect(await ok.json()).toEqual({ data: { me: 'ok' } });
	});

	test('mounted under a prefix, the guard comes along', async () => {
		const served = guarded().plugin((app) =>
			graphql(app, { schema, logging: false }),
		);
		const root = alxia({ prefix: '/v1' }).plugin(served);
		expect((await post(root, '/v1/api/graphql')).status).toBe(401);
		const mounted = await post(root, '/v1/api/graphql', {
			authorization: 'Bearer ok',
		});
		expect(await mounted.json()).toEqual({ data: { me: 'ok' } });
	});

	test('a try/catch middleware before the guard answers what it throws', async () => {
		const app = alxia()
			.use(async ({ reply }, next) => {
				try {
					return await next();
				} catch {
					return reply(503, { error: 'unavailable' as const });
				}
			})
			.use((_ctx: BaseContext, next: NextFunction) => {
				if (Math.sign(1) > 0) throw new Error('store down');
				return next({ viewer: 'never' });
			})
			.plugin((app) => graphql(app, { schema, logging: false }));
		const response = await post(app, '/graphql');
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'unavailable' });
	});
});
