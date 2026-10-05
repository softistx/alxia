/**
 * A GraphQL app in dev: the route table names the endpoint, the 404 hint
 * points at it, and the dev error page leaves Yoga's own error handling
 * alone — a resolver's error stays in `errors[]`, to a browser too.
 */
import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query {
			hello: String!
			boom: String
		}
	`,
	resolvers: {
		Query: {
			hello: () => 'world',
			boom: () => {
				throw new Error('database password is hunter2');
			},
		},
	},
});

const app = () =>
	alxia({ dev: true })
		.use(function logger(_ctx, next) {
			return next();
		})
		.plugin((served) => graphql(served, { schema }));

const BROWSER = 'text/html,application/xhtml+xml,*/*;q=0.8';

describe('a GraphQL app in dev', () => {
	test('the route table names the endpoint, its GET and its POST', async () => {
		const log = spyOn(console, 'log').mockImplementation(() => {});
		const served = app();
		try {
			served.listen({ port: 0, signals: false });
			const lines = String(log.mock.calls[0]?.[0]).split('\n').slice(1);
			expect(lines).toEqual([
				'  GET   /graphql  logger → graphql',
				'  POST  /graphql  logger → graphql',
			]);
		} finally {
			log.mockRestore();
			await served.stop(true);
		}
	});

	test('a 404 near the endpoint is pointed at it', async () => {
		const response = await app().request('/graphq', { method: 'POST' });
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: 'not_found',
			hint: 'did you mean POST /graphql?',
		});
	});

	test("a resolver's error stays in errors[], masked, to a browser too", async () => {
		const error = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const response = await app().request('/graphql', {
				method: 'POST',
				headers: { 'content-type': 'application/json', accept: BROWSER },
				body: JSON.stringify({ query: '{ hello boom }' }),
			});
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain(
				'application/json',
			);
			const body = (await response.json()) as {
				data: unknown;
				errors: { message: string }[];
			};
			expect(body.data).toEqual({ hello: 'world', boom: null });
			expect(body.errors).toHaveLength(1);
			expect(JSON.stringify(body)).not.toContain('hunter2');
			expect(JSON.stringify(body)).not.toContain('<!doctype html>');
		} finally {
			error.mockRestore();
		}
	});

	test('the IDE is still served to a browser at the endpoint', async () => {
		const response = await app().request('/graphql', {
			headers: { accept: BROWSER },
		});
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('GraphiQL');
	});
});
