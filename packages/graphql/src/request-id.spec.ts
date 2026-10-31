/**
 * A client-sent `x-request-id` is never believed: not echoed, not logged.
 * Yoga 6 reads it by default and logs a "Request processed" line at INFO per
 * request; the endpoint turns both off unless the app asks otherwise. Yoga 5
 * has neither, and ignores the options.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { spyLogger } from '../test/hive-logger';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ 'type Query { ping: String }',
	resolvers: { Query: { ping: () => 'pong' } },
});

const forged = (app: {
	request: (path: string, init: RequestInit) => unknown;
}) =>
	app.request('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-request-id': 'forged',
		},
		body: JSON.stringify({ query: '{ ping }' }),
	}) as Promise<Response>;

const everything = (calls: Record<string, unknown[][]>) =>
	JSON.stringify(Object.values(calls));

describe('x-request-id', () => {
	test('a forged id is not echoed and not logged', async () => {
		const { logger, calls } = spyLogger();
		const app = graphql(alxia(), { schema, ide: false, logging: logger });
		const res = await forged(app);
		expect(res.status).toBe(200);
		expect(res.headers.get('x-request-id')).not.toBe('forged');
		expect(everything(calls as never)).not.toContain('forged');
	});

	test('with the default logging, no per-request line reaches the console', async () => {
		const lines: string[] = [];
		const spies = ['log', 'info', 'debug'] as const;
		const saved = spies.map((m) => console[m]);
		for (const m of spies)
			console[m] = (...a: unknown[]) => void lines.push(a.join(' '));
		try {
			const res = await forged(graphql(alxia(), { schema, ide: false }));
			expect(res.headers.get('x-request-id')).not.toBe('forged');
		} finally {
			spies.forEach((m, i) => {
				console[m] = saved[i] as never;
			});
		}
		expect(lines.join('\n')).not.toContain('forged');
		expect(lines.join('\n')).not.toContain('Request processed');
	});

	test('an app that turns the id on still does not trust the header', async () => {
		const app = graphql(alxia(), {
			schema,
			ide: false,
			logging: false,
			requestId: true,
		} as never);
		const res = await forged(app);
		expect(res.headers.get('x-request-id')).not.toBe('forged');
	});
});
