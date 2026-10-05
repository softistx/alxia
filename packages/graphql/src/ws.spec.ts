/**
 * GraphQL over WebSocket on a real server, read by `graphql-ws`'s own
 * client: a query, a mutation and a subscription's stream; the upgrade
 * behind the app's middlewares — a guard's 401 refusing the socket, what
 * it adds in each resolver's context — the client's `connectionParams`
 * there too, Yoga's plugins applied, errors kept in `errors[]`, and
 * server-sent events served beside it.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, type BaseContext, type NextFunction } from '@alxia/core';
import { createClient, type FormattedExecutionResult } from 'graphql-ws';
import { createSchema, type Plugin } from 'graphql-yoga';
import { type GraphQLContext, graphql } from './graphql';

const guard = ({ request, reply }: BaseContext, next: NextFunction) =>
	request.headers.get('authorization') === 'Bearer ok' ||
	new URL(request.url).searchParams.get('token') === 'ok'
		? next({ viewer: 'ada' })
		: reply(401, { error: 'unauthorized' as const });

const base = () => alxia().use(guard);
let count = 0;

const schema = createSchema<GraphQLContext<ReturnType<typeof base>>>({
	typeDefs: /* GraphQL */ `
		type Query { me: String!, client: String, boom: String, tagged: String }
		type Mutation { increment: Int! }
		type Subscription { ticks(to: Int!): Int! }
	`,
	resolvers: {
		Query: {
			me: (_, __, context) => context.viewer,
			client: (_, __, context) =>
				(context.connectionParams?.['client'] as string | undefined) ?? null,
			boom: () => {
				throw new Error('the password is hunter2');
			},
			tagged: (_, __, context) => (context as { tag?: string }).tag ?? null,
		},
		Mutation: { increment: () => ++count },
		Subscription: {
			ticks: {
				async *subscribe(_, args: { to: number }) {
					for (let n = 1; n <= args.to; n++) yield { ticks: n };
				},
			},
		},
	},
});

/** A plugin of Yoga's, run on the socket's operations as on the endpoint's. */
const tagging: Plugin = {
	onContextBuilding: ({ extendContext }) =>
		extendContext({ tag: 'plugin' } as object),
};

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

function serve() {
	const app = base().plugin((app) =>
		graphql(app, { schema, ws: true, plugins: [tagging], logging: false }),
	);
	const server = app.listen({ port: 0, signals: false });
	stop = () => app.stop(true);
	const url = new URL('/graphql', server.url);
	url.protocol = 'ws:';
	return { app, http: new URL('/graphql', server.url), ws: url };
}

function client(url: URL, connectionParams?: Record<string, unknown>) {
	const target = new URL(url);
	target.searchParams.set('token', 'ok');
	return createClient({
		url: target.href,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
		lazy: true,
		connectionParams,
	});
}

async function all(
	subscribe: (sink: {
		next: (value: FormattedExecutionResult) => void;
		error: (error: unknown) => void;
		complete: () => void;
	}) => () => void,
): Promise<FormattedExecutionResult[]> {
	const results: FormattedExecutionResult[] = [];
	await new Promise<void>((resolve, reject) => {
		subscribe({
			next: (value) => results.push(value),
			error: reject,
			complete: resolve,
		});
	});
	return results;
}

describe('graphql({ ws: true })', () => {
	test('a query, a mutation and a subscription, behind the guard', async () => {
		const { ws } = serve();
		const graphqlWs = client(ws);
		const read = (query: string) =>
			all((sink) => graphqlWs.subscribe({ query }, sink));
		expect(await read('{ me tagged }')).toEqual([
			{ data: { me: 'ada', tagged: 'plugin' } },
		]);
		expect(await read('mutation { increment }')).toEqual([
			{ data: { increment: count } },
		]);
		expect(await read('subscription { ticks(to: 3) }')).toEqual([
			{ data: { ticks: 1 } },
			{ data: { ticks: 2 } },
			{ data: { ticks: 3 } },
		]);
		await graphqlWs.dispose();
	});

	test("the client's connectionParams are in the context", async () => {
		const { ws } = serve();
		const graphqlWs = client(ws, { client: 'web' });
		expect(
			await all((sink) => graphqlWs.subscribe({ query: '{ client }' }, sink)),
		).toEqual([{ data: { client: 'web' } }]);
		await graphqlWs.dispose();
	});

	test("a resolver's error stays in errors[], masked", async () => {
		const { ws } = serve();
		const graphqlWs = client(ws);
		const [result] = await all((sink) =>
			graphqlWs.subscribe({ query: '{ boom }' }, sink),
		);
		expect(result?.errors?.[0]?.message).toBe('Unexpected error.');
		await graphqlWs.dispose();
	});

	test('a query that does not parse or validate is an error message, the socket kept', async () => {
		const { ws } = serve();
		const graphqlWs = client(ws);
		const failed = (query: string) =>
			all((sink) => graphqlWs.subscribe({ query }, sink)).then(
				() => [],
				(errors: { message: string }[]) => errors.map((e) => e.message),
			);
		expect(await failed('{ me')).toEqual([
			'Syntax Error: Expected Name, found <EOF>.',
		]);
		expect(await failed('{ nope }')).toEqual([
			'Cannot query field "nope" on type "Query".',
		]);
		expect(
			await all((sink) => graphqlWs.subscribe({ query: '{ me }' }, sink)),
		).toEqual([{ data: { me: 'ada' } }]);
		await graphqlWs.dispose();
	});

	test('the guard refuses the upgrade with its 401', async () => {
		const { ws } = serve();
		const refused = await fetch(new URL(ws.pathname, `http://${ws.host}`), {
			headers: {
				connection: 'upgrade',
				upgrade: 'websocket',
				'sec-websocket-version': '13',
				'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'sec-websocket-protocol': 'graphql-transport-ws',
			},
		});
		expect(refused.status).toBe(401);
		expect(await refused.json()).toEqual({ error: 'unauthorized' });
	});

	test('the subprotocol is named in the 101, any other refused with 4406', async () => {
		const { ws } = serve();
		const target = new URL(ws);
		target.searchParams.set('token', 'ok');
		const socket = new WebSocket(target, 'graphql-transport-ws');
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		expect(socket.protocol).toBe('graphql-transport-ws');
		socket.close();
		const legacy = new WebSocket(target);
		const closed = await new Promise<CloseEvent>((resolve) => {
			legacy.onclose = resolve;
		});
		expect(closed.code).toBe(4406);
	});

	test('server-sent events are still served', async () => {
		const { http } = serve();
		const response = await fetch(http, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'text/event-stream',
				authorization: 'Bearer ok',
			},
			body: JSON.stringify({ query: 'subscription { ticks(to: 2) }' }),
		});
		const text = await response.text();
		expect(text).toContain('{"data":{"ticks":1}}');
		expect(text).toContain('{"data":{"ticks":2}}');
	});
});
