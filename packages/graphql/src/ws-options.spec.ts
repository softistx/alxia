/**
 * `ws`'s options on a real server: a socket at a path of its own, run by
 * the endpoint's one Yoga — its plugins set up once — under a group's
 * prefix too; `keepAlive`'s pings, none with `false`, and a value that
 * would ping in a loop refused; and a message sent as a binary frame.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createClient } from 'graphql-ws';
import { createSchema, type Plugin } from 'graphql-yoga';
import { type GraphQLWsOptions, graphql } from './index';

const schema = createSchema({
	typeDefs: /* GraphQL */ 'type Query { ok: Boolean! }',
	resolvers: { Query: { ok: () => true } },
});

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

function serve(ws: GraphQLWsOptions, plugins: Plugin[] = []) {
	const app = alxia().group('/api', (api) =>
		graphql(api, { schema, ws, plugins, logging: false }),
	);
	const server = app.listen({ port: 0, signals: false });
	stop = () => app.stop(true);
	return (path: string) => {
		const url = new URL(path, server.url);
		url.protocol = 'ws:';
		return url;
	};
}

const ok = async (url: URL) => {
	const client = createClient({
		url: url.href,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
	});
	const results = [];
	for await (const result of client.iterate({ query: '{ ok }' })) {
		results.push(result);
	}
	await client.dispose();
	return results;
};

/** A socket speaking the protocol by hand, counting the pings it gets. */
async function opened(url: URL) {
	const socket = new WebSocket(url, 'graphql-transport-ws');
	const received: string[] = [];
	let pings = 0;
	socket.addEventListener('ping' as never, () => pings++);
	socket.onmessage = (event) => received.push(String(event.data));
	await new Promise((resolve) => {
		socket.onopen = resolve;
	});
	return { socket, received, pings: () => pings };
}

describe('graphql({ ws: { path } })', () => {
	test("a socket at a path of its own, under the group's prefix, run by the endpoint's Yoga", async () => {
		let created = 0;
		const at = serve({ path: '/graphql/ws' }, [
			{ onYogaInit: () => void created++ },
		]);
		const http = new URL(at('/api/graphql'));
		http.protocol = 'http:';
		http.searchParams.set('query', '{ ok }');
		expect(await (await fetch(http)).json()).toEqual({ data: { ok: true } });
		expect(await ok(at('/api/graphql/ws'))).toEqual([{ data: { ok: true } }]);
		expect(created).toBe(1);
	});

	test("a path that does not start with '/' is a compile error", () => {
		const _never = () =>
			alxia().plugin((app) =>
				// @ts-expect-error: a socket's path is a route's, `/${string}`
				graphql(app, { schema, ws: { path: 'graphql/ws' } }),
			);
		expect(_never).toBeFunction();
	});
});

describe('graphql({ ws: { keepAlive } })', () => {
	test('pings each socket at the interval, none with false', async () => {
		const pinging = await opened(serve({ keepAlive: 20 })('/api/graphql'));
		await Bun.sleep(120);
		expect(pinging.pings()).toBeGreaterThanOrEqual(2);
		pinging.socket.close();
		await stop?.();

		const quiet = await opened(serve({ keepAlive: false })('/api/graphql'));
		await Bun.sleep(120);
		expect(quiet.pings()).toBe(0);
		quiet.socket.close();
	});

	test('a value that is not a positive number is refused where graphql() is declared', () => {
		for (const keepAlive of [0, -1, Number.NaN]) {
			expect(() =>
				alxia().plugin((app) => graphql(app, { schema, ws: { keepAlive } })),
			).toThrow(
				`graphql(app, { ws: { keepAlive: ${keepAlive} } }): keepAlive is the milliseconds between pings, a positive number, or false for none`,
			);
		}
	});

	test('a message sent as a binary frame is read as text', async () => {
		const { socket, received } = await opened(serve({})('/api/graphql'));
		socket.send(new TextEncoder().encode('{"type":"connection_init"}'));
		while (received.length === 0) await Bun.sleep(5);
		expect(JSON.parse(received[0] as string)).toEqual({
			type: 'connection_ack',
		});
		socket.close();
	});
});
