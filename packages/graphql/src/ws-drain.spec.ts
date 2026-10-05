/**
 * GraphQL over WebSocket in the app's shutdown: readiness turns 503, each
 * open socket is closed with 1001 and its subscriptions are completed —
 * the resolver's iterator returned, the client told the socket went away —
 * so the drain does not wait for them.
 */
import { expect, test } from 'bun:test';
import { alxia, health } from '@alxia/core';
import { createClient } from 'graphql-ws';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const ended: string[] = [];

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { ok: Boolean }
		type Subscription { ticks: Int! }
	`,
	resolvers: {
		Subscription: {
			ticks: {
				async *subscribe() {
					try {
						for (let n = 0; ; n++) {
							yield { ticks: n };
							await Bun.sleep(20);
						}
					} finally {
						ended.push('iterator returned');
					}
				},
			},
		},
	},
});

test('a shutdown closes the sockets with 1001 and completes their subscriptions', async () => {
	const app = alxia()
		.plugin(health())
		.plugin((app) => graphql(app, { schema, ws: true, logging: false }));
	const server = app.listen({ port: 0, signals: false });
	const url = new URL('/graphql', server.url);
	url.protocol = 'ws:';
	const closes: number[] = [];
	const client = createClient({
		url: url.href,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
		on: { closed: (event) => closes.push((event as CloseEvent).code) },
	});
	const ticks: number[] = [];
	const done = new Promise<unknown>((resolve) => {
		client.subscribe<{ ticks: number }>(
			{ query: 'subscription { ticks }' },
			{
				next: ({ data }) => {
					if (data) ticks.push(data.ticks);
				},
				error: resolve,
				complete: () => resolve('complete'),
			},
		);
	});
	while (ticks.length < 2) await Bun.sleep(10);

	const start = performance.now();
	const stopping = app.stop();
	expect((await app.request('/ready')).status).toBe(503);
	await done;
	await stopping;
	expect(performance.now() - start).toBeLessThan(2_000);
	expect(closes).toEqual([1001]);
	// Returned once the tick it was awaiting is out.
	for (let wait = 0; ended.length === 0 && wait < 50; wait++)
		await Bun.sleep(10);
	expect(ended).toEqual(['iterator returned']);
	await client.dispose();
});
