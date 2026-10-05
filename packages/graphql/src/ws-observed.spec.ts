/**
 * The operations of a socket, seen by `@alxia/logger` and
 * `@alxia/telemetry` on a real server through `graphql-ws`'s client: a
 * query, a mutation and a subscription each a line and a span, named and
 * timed, a child of the upgrade's; errors marked; many operations on one
 * socket; a subscription stopped or cut ended.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import type { SpanRecord } from '@nxgt/telemetry';
import {
	ADD,
	NOTES,
	operationLines,
	run,
	serve,
	stopServer,
	TICKS,
} from '../test/ws-observed/harness';

afterEach(stopServer);

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
});
