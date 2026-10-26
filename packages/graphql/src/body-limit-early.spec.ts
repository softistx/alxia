import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { chunked, send } from '../test/body';
import { graphql } from './graphql';

const LIMIT = 1024;

describe('graphql(), where a declared oversize body is refused', () => {
	const MIB = 1_048_576;
	const blank = (bytes: number) =>
		JSON.stringify({ query: `{ ping }${' '.repeat(bytes)}` });

	function counting() {
		const ran: string[] = [];
		const counted = createSchema({
			typeDefs: 'type Query { ping: String }',
			resolvers: {
				Query: {
					ping: () => {
						ran.push('resolver');
						return 'pong';
					},
				},
			},
		});
		return { ran, counted };
	}

	test('a middleware after bodyLimit() does not run on a declared oversize body', async () => {
		const { ran, counted } = counting();
		const target = graphql(
			alxia()
				.use((_ctx, next) => {
					ran.push('before');
					return next();
				})
				.bodyLimit(LIMIT)
				.use((_ctx, next) => {
					ran.push('after');
					return next();
				}),
			{ schema: counted, logging: false },
		);
		const response = await send(target, blank(2 * LIMIT));
		expect(response.status).toBe(413);
		expect(ran).toEqual(['before']);
		const chunkedResponse = await send(
			target,
			chunked('{"query":"{ ping }"}', 8 * LIMIT),
		);
		expect(chunkedResponse.status).toBe(413);
		expect(ran).toEqual(['before', 'before', 'after']);
	});

	test("the endpoint's own option refuses a declared body before the handler", async () => {
		const { ran, counted } = counting();
		const target = graphql(alxia(), {
			schema: counted,
			logging: false,
			bodyLimit: LIMIT,
		});
		expect((await send(target, blank(2 * LIMIT))).status).toBe(413);
		expect(ran).toEqual([]);
	});

	test('the 1 MiB default refuses a declared body before the handler', async () => {
		const { ran, counted } = counting();
		const target = graphql(alxia(), { schema: counted, logging: false });
		const refused = await send(target, blank(MIB));
		expect(refused.status).toBe(413);
		expect(ran).toEqual([]);
		expect((await send(target, blank(1024))).status).toBe(200);
		expect(ran).toEqual(['resolver']);
	});
});
