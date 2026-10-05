/**
 * The operations of a socket, seen by `@alxia/logger` and
 * `@alxia/telemetry` on a real server through `graphql-ws`'s client: a
 * query, a mutation and a subscription each a line and a span, named and
 * timed, a child of the upgrade's; errors marked; many operations on one
 * socket; nothing when neither observer is there; the HTTP endpoint as
 * before.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type LogEntry, logger } from '@alxia/logger';
import { telemetry } from '@alxia/telemetry';
import {
	createTelemetry,
	type SpanRecord,
	type Telemetry,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { type Client, createClient } from 'graphql-ws';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { notes: [String!]!, boom: String }
		type Mutation { add(text: String!): String! }
		type Subscription { ticks(to: Int!): Int!, broken: Int! }
	`,
	resolvers: {
		Query: {
			notes: () => ['a'],
			boom: () => {
				throw new Error('boom');
			},
		},
		Mutation: { add: (_, args: { text: string }) => args.text },
		Subscription: {
			ticks: {
				async *subscribe(_, args: { to: number }) {
					for (let n = 1; n <= args.to; n++) {
						await Bun.sleep(10);
						yield { ticks: n };
					}
				},
			},
			broken: {
				// biome-ignore lint/correctness/useYield: it fails before its first event
				async *subscribe() {
					throw new Error('broken');
				},
			},
		},
	},
});

const NOTES = 'query GetNotes { notes }';
const ADD = 'mutation AddNote { add(text: "b") }';
const TICKS = 'subscription OnTick { ticks(to: 3) }';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
	uninstallTelemetry();
});

/** A server with the observers asked for, its log lines, its spans. */
function serve(observers: { logger?: boolean; telemetry?: boolean }) {
	const lines: LogEntry[] = [];
	const spans: SpanRecord[] = [];
	const instance: Telemetry = createTelemetry('alxia-test', {
		exporters: [
			{
				export(_resource, batch) {
					for (const signal of batch) {
						if (signal.type === 'span') spans.push(signal);
					}
				},
			},
		],
		batch: 1,
	});
	let app = alxia();
	if (observers.logger) {
		app = app.use(logger({ write: (entry) => lines.push(entry) }));
	}
	if (observers.telemetry) app = app.use(telemetry({ instance }));
	const served = app.plugin((app) =>
		graphql(app, { schema, ws: true, logging: false }),
	);
	const server = served.listen({ port: 0, signals: false });
	stop = () => served.stop(true);
	const ws = new URL('/graphql', server.url);
	ws.protocol = 'ws:';
	const client = createClient({
		url: ws.href,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
		lazy: false,
	});
	const flushed = async () => {
		await Bun.sleep(5);
		await instance.close();
		return spans;
	};
	return { app: served, client, lines, flushed };
}

/** Runs `query` on `client` to its end, and whether it ended with errors. */
function run(client: Client, query: string): Promise<boolean> {
	return new Promise((resolve) => {
		let errors = false;
		client.subscribe(
			{ query },
			{
				next: (result) => {
					errors ||= result.errors !== undefined;
				},
				error: () => resolve(true),
				complete: () => resolve(errors),
			},
		);
	});
}

const operationLines = (lines: LogEntry[]) =>
	lines.filter((line) => line.operationType !== undefined);

describe('the operations of a socket, logged and traced', () => {
	test('a query, a mutation and a subscription: a line and a span each, named, timed, under the upgrade', async () => {
		const { client, lines, flushed } = serve({ logger: true, telemetry: true });
		expect(await run(client, NOTES)).toBe(false);
		expect(await run(client, ADD)).toBe(false);
		expect(await run(client, TICKS)).toBe(false);
		await client.dispose();
		const spans = await flushed();

		const [upgrade, ...operations] = lines;
		expect(upgrade?.message).toBe('GET /graphql 200');
		expect(operations.map((line) => line.message)).toEqual([
			'query GetNotes',
			'mutation AddNote',
			'subscription OnTick',
		]);
		for (const line of operations) {
			expect(line).toMatchObject({
				level: 'info',
				requestId: upgrade?.requestId,
				method: 'GET',
				path: '/graphql',
				outcome: 'ok',
			});
			expect(line.duration).toBeGreaterThanOrEqual(0);
		}
		expect(operations.map((line) => line.operationType)).toEqual([
			'query',
			'mutation',
			'subscription',
		]);
		expect(operations[2]?.operationName).toBe('OnTick');
		// Three ticks, ten milliseconds apart: the subscription to its end.
		expect(operations[2]?.duration).toBeGreaterThanOrEqual(25);

		const upgradeSpan = spans.find((span) => span.name === 'GET /graphql');
		expect(upgradeSpan).toBeDefined();
		const named = (name: string) =>
			spans.find((span) => span.name === name) as SpanRecord;
		for (const [name, type] of [
			['query GetNotes', 'query'],
			['mutation AddNote', 'mutation'],
			['subscription OnTick', 'subscription'],
		] as const) {
			const span = named(name);
			expect(span.parent).toBe(upgradeSpan?.context.spanId);
			expect(String(span.context.traceId)).toBe(
				String(upgradeSpan?.context.traceId),
			);
			expect(span.kind).toBe('server');
			expect(span.status).toBe('ok');
			expect(span.attributes['graphql.operation.type']).toBe(type);
		}
		const ticks = named('subscription OnTick');
		expect(ticks.endedAt - ticks.startedAt).toBeGreaterThanOrEqual(25);
	});

	test('errors are marked: a resolver that throws, an invalid document, a subscription that fails', async () => {
		const { client, lines, flushed } = serve({ logger: true, telemetry: true });
		expect(await run(client, 'query Boom { boom }')).toBe(true);
		expect(await run(client, 'query Unknown { nothing }')).toBe(true);
		expect(await run(client, 'subscription Broken { broken }')).toBe(true);
		await client.dispose();
		const spans = await flushed();

		expect(
			operationLines(lines).map(({ message, level, outcome }) => ({
				message,
				level,
				outcome,
			})),
		).toEqual([
			{ message: 'query Boom errors', level: 'warn', outcome: 'errors' },
			{ message: 'query Unknown errors', level: 'warn', outcome: 'errors' },
			{
				message: 'subscription Broken errors',
				level: 'warn',
				outcome: 'errors',
			},
		]);
		for (const name of ['query Boom', 'query Unknown', 'subscription Broken']) {
			expect(spans.find((span) => span.name === name)?.status).toBe('error');
		}
	});

	test('many operations on one socket, at once: one line and one span each', async () => {
		const { client, lines, flushed } = serve({ logger: true, telemetry: true });
		await Promise.all(
			Array.from({ length: 5 }, (_, n) => run(client, `query Q${n} { notes }`)),
		);
		await client.dispose();
		const spans = await flushed();
		const names = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];
		expect(
			operationLines(lines)
				.map((line) => line.operationName)
				.sort(),
		).toEqual(names);
		expect(
			spans
				.filter((span) => span.attributes['graphql.operation.type'])
				.map((span) => span.name)
				.sort(),
		).toEqual(names.map((name) => `query ${name}`));
	});

	test('a subscription stopped by its client, or cut by the socket closing, is ended', async () => {
		const { client, lines, flushed } = serve({ logger: true, telemetry: true });
		const forever = 'subscription Long { ticks(to: 1000) }';
		await new Promise<void>((resolve) => {
			const unsubscribe = client.subscribe(
				{ query: forever },
				{
					next: () => {
						unsubscribe();
						resolve();
					},
					error: () => {},
					complete: () => {},
				},
			);
		});
		client.subscribe(
			{ query: 'subscription Cut { ticks(to: 1000) }' },
			{ next: () => {}, error: () => {}, complete: () => {} },
		);
		await Bun.sleep(30);
		await client.dispose();
		await Bun.sleep(30);
		const spans = await flushed();
		expect(operationLines(lines).map((line) => line.message)).toEqual([
			'subscription Long',
			'subscription Cut',
		]);
		expect(spans.map((span) => span.name)).toContain('subscription Cut');
	});

	test('with the logger alone, lines and no span; with neither, the operations run all the same', async () => {
		const logged = serve({ logger: true });
		expect(await run(logged.client, NOTES)).toBe(false);
		await logged.client.dispose();
		expect(await logged.flushed()).toEqual([]);
		expect(operationLines(logged.lines)).toHaveLength(1);
		await stop?.();

		const traced = serve({ telemetry: true });
		expect(await run(traced.client, NOTES)).toBe(false);
		await traced.client.dispose();
		expect((await traced.flushed()).map((span) => span.name)).toEqual([
			'GET /graphql',
			'query GetNotes',
		]);
		await stop?.();

		const bare = serve({});
		expect(await run(bare.client, NOTES)).toBe(false);
		expect(await run(bare.client, 'query Boom { boom }')).toBe(true);
		await bare.client.dispose();
		expect(bare.lines).toEqual([]);
		expect(await bare.flushed()).toEqual([]);
	});

	test('over HTTP, as before: one line and one span per request, named for its operation', async () => {
		const { app, client, lines, flushed } = serve({
			logger: true,
			telemetry: true,
		});
		await client.dispose();
		const response = await app.request('/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: NOTES }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { notes: ['a'] } });
		const spans = await flushed();
		const http = lines.filter((line) => line.method === 'POST');
		expect(http).toHaveLength(1);
		expect(http[0]).toMatchObject({
			message: 'POST /graphql 200',
			operationName: 'GetNotes',
			operationType: 'query',
		});
		// Yoga's body is a stream: the line says it was sent whole, as before.
		expect(http[0]?.outcome).toBe('completed');
		const span = spans.find((span) => span.name === 'query GetNotes');
		expect(span?.attributes['http.request.method']).toBe('POST');
		expect(span?.parent).toBeUndefined();
	});
});
