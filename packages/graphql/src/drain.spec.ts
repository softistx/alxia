/**
 * A GraphQL app shuts down as any alxia app: `health()` beside the
 * endpoint, readiness 503 once the shutdown starts, a query in flight
 * answered during the drain, a subscription over server-sent events
 * ended so the drain does not wait for it, and a new connection refused;
 * and GraphQL errors kept in `errors[]` under `errors: 'problem'`.
 */
import { describe, expect, test } from 'bun:test';
import { alxia, HttpError, health } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { slow: String!, boom: String }
		type Subscription { ticks: Int! }
	`,
	resolvers: {
		Query: {
			boom: () => {
				throw new Error('the password is hunter2');
			},
			slow: async () => {
				await Bun.sleep(300);
				return 'answered';
			},
		},
		Subscription: {
			ticks: {
				async *subscribe() {
					for (let n = 0; ; n++) {
						yield { ticks: n };
						await Bun.sleep(50);
					}
				},
			},
		},
	},
});

const post = (query: string, accept = 'application/json'): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json', accept },
	body: JSON.stringify({ query }),
});

describe('graphql(), health and the drain', () => {
	test('liveness and readiness beside the endpoint', async () => {
		const app = alxia()
			.plugin(health({ checks: { db: () => true } }))
			.plugin((app) => graphql(app, { schema, ide: false }));
		expect((await app.request('/health')).status).toBe(200);
		expect((await app.request('/ready')).status).toBe(200);
		const answered = await app.request('/graphql', post('{ __typename }'));
		expect(await answered.json()).toEqual({ data: { __typename: 'Query' } });
	});

	test('a query in flight is answered, a subscription ends, a new connection is refused', async () => {
		const stopped: string[] = [];
		const app = alxia()
			.plugin(health())
			.plugin((app) => graphql(app, { schema, ide: false }))
			.onStop(() => {
				stopped.push('onStop');
			});
		const server = app.listen({ port: 0, signals: false });
		const url = `${server.url.href}graphql`;
		const subscription = await fetch(
			url,
			post('subscription { ticks }', 'text/event-stream'),
		);
		const events = subscription.text();
		const slow = fetch(url, post('{ slow }')).then((response) =>
			response.json(),
		);
		await Bun.sleep(100);
		const start = performance.now();
		const stopping = app.stop();
		expect((await app.request('/ready')).status).toBe(503);
		const refused = await fetch(url, post('{ __typename }')).then(
			() => 'answered',
			(error: { code?: string }) => error.code,
		);
		expect(refused).toBe('ConnectionRefused');
		expect(await slow).toEqual({ data: { slow: 'answered' } });
		expect(await events).toContain('{"data":{"ticks":0}}');
		await stopping;
		expect(performance.now() - start).toBeLessThan(2_000);
		expect(stopped).toEqual(['onStop']);
	});
});

describe('graphql(), errors: problem', () => {
	test("errors: 'problem' leaves GraphQL's errors in errors[], and makes the HTTP layer's problems", async () => {
		const app = alxia({ errors: 'problem' })
			.use((ctx, next) => {
				if (ctx.request.headers.has('x-deny')) {
					throw new HttpError(401, { error: 'unauthorized' });
				}
				return next();
			})
			.plugin((app) => graphql(app, { schema, ide: false, logging: false }));
		const failed = await app.request('/graphql', post('{ boom }'));
		expect(failed.status).toBe(200);
		expect(failed.headers.get('content-type')).toContain('application/json');
		const body = await failed.json();
		expect(body.errors[0].message).toBe('Unexpected error.');
		const denied = await app.request('/graphql', {
			...post('{ boom }'),
			headers: { 'content-type': 'application/json', 'x-deny': '1' },
		});
		expect(denied.status).toBe(401);
		expect(denied.headers.get('content-type')).toBe('application/problem+json');
		expect(await denied.json()).toMatchObject({
			title: 'Unauthorized',
			instance: '/graphql',
		});
	});
});
