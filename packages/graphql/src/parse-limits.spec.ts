/**
 * `maxTokens`: a document longer than the limit is refused by the parser
 * as any document it cannot parse is (`GRAPHQL_PARSE_FAILED`), over POST,
 * GET, a batch and a WebSocket, never logged and never a 500.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { parse } from 'graphql';
import { createSchema, type Plugin } from 'graphql-yoga';
import { spyLogger } from '../test/hive-logger';
import { queryOf } from '../test/queries';
import { type GraphQLOptions, graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ 'type Query { ping: String }',
	resolvers: { Query: { ping: () => 'pong' } },
});

function logs() {
	const { logger, calls } = spyLogger();
	return { errors: calls['error'] as unknown[][], logging: logger };
}

const serve = (
	options: Partial<GraphQLOptions<never, never, '/graphql'>> = {},
	spy = logs(),
) =>
	graphql(alxia(), {
		schema,
		ide: false,
		logging: spy.logging,
		batching: true,
		...options,
	} as never);

const post = (
	app: ReturnType<typeof serve>,
	body: unknown,
	accept = 'application/graphql-response+json',
) =>
	app.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept },
		body: JSON.stringify(body),
	});

describe('graphql({ maxTokens })', () => {
	test('15 001 tokens are refused as a parse failure, 15 000 run', async () => {
		const spy = logs();
		const app = serve({}, spy);
		const refused = await post(app, { query: queryOf(15_001) });
		expect(refused.status).toBe(400);
		const body = (await refused.json()) as {
			data?: unknown;
			errors: { message: string; extensions: { code: string } }[];
		};
		expect(body.data).toBeUndefined();
		expect(body.errors[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
		expect(body.errors[0]?.message).toMatch(/more tha[tn] 15000 tokens/);
		expect(spy.errors).toEqual([]);

		const ran = await post(app, { query: queryOf(15_000) });
		expect(ran.status).toBe(200);
		expect(((await ran.json()) as { data: { ping: string } }).data.ping).toBe(
			'pong',
		);
	});

	test('under application/json it is a 200 with errors and no data', async () => {
		const response = await post(
			serve(),
			{ query: queryOf(15_001) },
			'application/json',
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data?: unknown;
			errors: { extensions: { code: string } }[];
		};
		expect(body.data).toBeUndefined();
		expect(body.errors[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
	});

	test('a GET ?query= is refused the same way', async () => {
		const spy = logs();
		const response = await serve({}, spy).request(
			`/graphql?query=${encodeURIComponent(queryOf(15_001))}`,
			{ headers: { accept: 'application/graphql-response+json' } },
		);
		expect(response.status).toBe(400);
		expect(
			(
				(await response.json()) as {
					errors: { extensions: { code: string } }[];
				}
			).errors[0]?.extensions.code,
		).toBe('GRAPHQL_PARSE_FAILED');
		expect(spy.errors).toEqual([]);
	});

	test('in a batch only the over-long operation fails', async () => {
		const response = await post(
			serve(),
			[{ query: '{ ping }' }, { query: queryOf(15_001) }],
			'application/json',
		);
		expect(response.status).toBe(200);
		const [first, second] = (await response.json()) as [
			{ data: { ping: string } },
			{ errors: { extensions: { code: string } }[] },
		];
		expect(first.data.ping).toBe('pong');
		expect(second.errors[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
	});

	test('maxTokens caps at the number given', async () => {
		const app = serve({ maxTokens: 50 });
		expect((await post(app, { query: queryOf(50) })).status).toBe(200);
		expect((await post(app, { query: queryOf(51) })).status).toBe(400);
	});

	test('maxTokens: false parses a 20 000-token query', async () => {
		const response = await post(serve({ maxTokens: false }), {
			query: queryOf(20_000),
		});
		expect(response.status).toBe(200);
	});

	test('an app plugin that sets its own parse function wins', async () => {
		const own: Plugin = {
			onParse({ setParseFn }) {
				setParseFn((source, options) => parse(source, options));
			},
		};
		const response = await post(serve({ plugins: [own] }), {
			query: queryOf(15_001),
		});
		expect(response.status).toBe(200);
	});

	for (const bad of [0, -1, 1.5, Number.NaN, '10']) {
		test(`maxTokens: ${String(bad)} is refused at declaration`, () => {
			expect(() => serve({ maxTokens: bad as never })).toThrow(
				new TypeError(
					`graphql(app, { maxTokens }): maxTokens is the most tokens a document may hold, a positive whole number, or false for none; got ${String(bad)}`,
				),
			);
		});
	}
});

describe('graphql({ maxTokens, ws })', () => {
	let stop: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await stop?.();
		stop = undefined;
	});

	test("the operation's error message names the limit, the socket stays open", async () => {
		const app = graphql(alxia(), {
			schema,
			ide: false,
			ws: true,
			logging: false,
		} as never);
		const server = app.listen({ port: 0, signals: false });
		stop = () => app.stop(true);
		const url = new URL('/graphql', server.url);
		url.protocol = 'ws:';
		const socket = new WebSocket(url, 'graphql-transport-ws');
		const received: { type: string; id?: string; payload?: unknown }[] = [];
		socket.onmessage = (event) => received.push(JSON.parse(String(event.data)));
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		const next = async (type: string) => {
			for (let i = 0; i < 200; i++) {
				const found = received.find((message) => message.type === type);
				if (found !== undefined) return found;
				await Bun.sleep(10);
			}
			throw new Error(`no ${type} message`);
		};
		socket.send(JSON.stringify({ type: 'connection_init' }));
		await next('connection_ack');
		socket.send(
			JSON.stringify({
				id: '1',
				type: 'subscribe',
				payload: { query: queryOf(15_001) },
			}),
		);
		const error = await next('error');
		expect(JSON.stringify(error.payload)).toMatch(/more tha[tn] 15000 tokens/);
		expect(socket.readyState).toBe(WebSocket.OPEN);
		socket.close();
	});
});
