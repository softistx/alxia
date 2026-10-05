/**
 * Run alone by `src/ws-peer.spec.ts`, in a `bun test` of its own: the
 * module mock that makes `graphql-ws` missing would reach every spec file
 * of the process it ran in.
 */
import { expect, mock, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';

mock.module('graphql-ws', () => {
	throw new Error("Cannot find package 'graphql-ws'");
});

test('a missing graphql-ws is named on the upgrade', async () => {
	const { graphql } = await import('../../src/graphql');
	const schema = createSchema({ typeDefs: 'type Query { ok: Boolean }' });
	const app = alxia().plugin((app) => graphql(app, { schema, ws: true }));
	const server = app.listen({ port: 0, signals: false });
	const logged = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const response = await fetch(new URL('/graphql', server.url), {
			headers: {
				connection: 'upgrade',
				upgrade: 'websocket',
				'sec-websocket-version': '13',
				'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'sec-websocket-protocol': 'graphql-transport-ws',
			},
		});
		expect(response.status).toBe(500);
		expect(String(logged.mock.calls[0]?.[0])).toContain(
			'optional peer graphql-ws, which is not installed: bun add graphql-ws',
		);
	} finally {
		logged.mockRestore();
		await app.stop(true);
	}
});
