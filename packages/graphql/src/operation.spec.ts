/**
 * The operation each request executes, told to the observers around the
 * endpoint (`operationOf`, which `@alxia/logger` and `@alxia/telemetry`
 * read): its type and name for one operation, `batch` for an array body,
 * nothing for a request refused before it executes, and nothing for the
 * operations of a socket.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, type OperationSummary, operationOf } from '@alxia/core';
import { createClient } from 'graphql-ws';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { notes: [String!]! }
		type Mutation { add(text: String!): String! }
		type Subscription { ticks: Int! }
	`,
	resolvers: {
		Query: { notes: () => ['a'] },
		Mutation: { add: (_, args: { text: string }) => args.text },
		Subscription: {
			ticks: {
				async *subscribe() {
					yield { ticks: 1 };
				},
			},
		},
	},
});

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

/** An app whose first observer reads the summary once the endpoint answered. */
function observed(
	options: Parameters<typeof graphql>[1] extends infer O
		? Partial<O>
		: never = {},
) {
	const seen: Array<OperationSummary | undefined> = [];
	const app = alxia()
		.use(async (ctx, next) => {
			const response = await next();
			// A subscription's body is read to its end, then the summary is final.
			await response.clone().text();
			seen.push(operationOf(ctx));
			return response;
		})
		.plugin((app) => graphql(app, { schema, logging: false, ...options }));
	return { app, seen };
}

const post = (
	app: { request: (path: string, init?: RequestInit) => Promise<Response> },
	body: unknown,
	accept?: string,
) =>
	app.request('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(accept === undefined ? {} : { accept }),
		},
		body: JSON.stringify(body),
	});

describe('the operation a request executes', () => {
	test('a named query, a mutation, an anonymous query and operationName among several', async () => {
		const { app, seen } = observed();
		await post(app, { query: 'query GetNotes { notes }' });
		await post(app, { query: 'mutation AddNote { add(text: "x") }' });
		await post(app, { query: '{ notes }' });
		await post(app, {
			query: 'query A { notes } query B { notes }',
			operationName: 'B',
		});
		expect(seen).toEqual([
			{ type: 'query', name: 'GetNotes' },
			{ type: 'mutation', name: 'AddNote' },
			{ type: 'query', name: undefined },
			{ type: 'query', name: 'B' },
		]);
	});

	test('a GET query is read too, and a subscription over server-sent events', async () => {
		const { app, seen } = observed();
		await app.request(
			`/graphql?query=${encodeURIComponent('query Q { notes }')}`,
		);
		await post(
			app,
			{ query: 'subscription Ticks { ticks }' },
			'text/event-stream',
		);
		expect(seen).toEqual([
			{ type: 'query', name: 'Q' },
			{ type: 'subscription', name: 'Ticks' },
		]);
	});

	test('an array body is a batch, with every name', async () => {
		const { app, seen } = observed({ batching: true });
		const response = await post(app, [
			{ query: 'query GetNotes { notes }' },
			{ query: 'mutation AddNote { add(text: "x") }' },
			{ query: '{ notes }' },
		]);
		expect(response.status).toBe(200);
		expect(seen).toEqual([{ type: 'batch', name: 'GetNotes,AddNote' }]);
	});

	test('a request refused before it executes reports none', async () => {
		const { app, seen } = observed();
		const syntax = await post(app, { query: 'query Bad {' });
		expect((await syntax.json()).errors).toHaveLength(1);
		const unknown = await post(app, { query: 'query Bad { missing }' });
		expect((await unknown.json()).errors).toHaveLength(1);
		expect(seen).toEqual([undefined, undefined]);
	});

	test('the operations of a socket are not reported on the upgrade', async () => {
		const { app, seen } = observed({ ws: true });
		const server = app.listen({ port: 0, signals: false });
		stop = () => app.stop(true);
		const url = new URL('/graphql', server.url);
		url.protocol = 'ws:';
		const socket = createClient({
			url: url.href,
			webSocketImpl: WebSocket,
			retryAttempts: 0,
		});
		const result = await new Promise((resolve, reject) =>
			socket.subscribe(
				{ query: 'query OverSocket { notes }' },
				{ next: resolve, error: reject, complete: () => {} },
			),
		);
		expect(result).toEqual({ data: { notes: ['a'] } });
		await socket.dispose();
		expect(seen).toEqual([undefined]);
	});
});
