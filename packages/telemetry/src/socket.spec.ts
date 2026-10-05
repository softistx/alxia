/**
 * The operations of a socket as spans: the upgrade's span, ended with its
 * answer, and one span per operation, a child of it, named and typed by
 * OpenTelemetry's GraphQL conventions, ended with the operation, an error
 * when answered with errors; none for an upgrade `traced` leaves out. The
 * socket here is a route that reports with core's `startOperation`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	alxia,
	type OperationOutcome,
	type OperationReport,
	startOperation,
} from '@alxia/core';
import {
	createTelemetry,
	type SpanRecord,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { telemetry } from './telemetry';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
	uninstallTelemetry();
});

type Operation = OperationReport & { readonly outcome: OperationOutcome };

/** The spans of a socket that runs each of `operations`, one per message. */
async function spansOf(
	operations: Operation[],
	traced = true,
): Promise<SpanRecord[]> {
	const spans: SpanRecord[] = [];
	const instance = createTelemetry('alxia-test', {
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
	const app = alxia()
		.use(telemetry({ instance, traced: () => traced }))
		.ws('/socket', {
			async message(socket, message) {
				const { outcome, ...report } = JSON.parse(String(message)) as Operation;
				const end = startOperation(socket.data, report);
				await Bun.sleep(5);
				end(outcome);
				socket.send('done');
			},
		});
	const server = app.listen({ port: 0, signals: false });
	stop = () => app.stop(true);
	const ws = new WebSocket(`ws://localhost:${server.port}/socket`);
	await new Promise((resolve) => ws.addEventListener('open', resolve));
	for (const operation of operations) {
		const done = new Promise((resolve) =>
			ws.addEventListener('message', resolve, { once: true }),
		);
		ws.send(JSON.stringify(operation));
		await done;
	}
	ws.close();
	await Bun.sleep(5);
	await instance.close();
	return spans;
}

describe('telemetry and the operations of a socket', () => {
	test('the upgrade a span, each operation a child of it, named, typed and timed', async () => {
		const spans = await spansOf([
			{ type: 'query', name: 'GetNotes', outcome: 'ok' },
			{ type: 'subscription', outcome: 'ok' },
		]);
		const upgrade = spans.find((span) => span.name === 'GET /socket');
		expect(upgrade?.attributes['http.route']).toBe('/socket');
		const query = spans.find((span) => span.name === 'query GetNotes');
		expect(query?.parent).toBe(upgrade?.context.spanId);
		expect(query?.context.traceId).toBe(upgrade?.context.traceId);
		expect(query?.kind).toBe('server');
		expect(query?.status).toBe('ok');
		expect(query?.attributes['graphql.operation.name']).toBe('GetNotes');
		expect(query?.attributes['graphql.operation.type']).toBe('query');
		expect(
			(query?.endedAt ?? 0) - (query?.startedAt ?? 0),
		).toBeGreaterThanOrEqual(4);
		// The upgrade's span ends with its answer, before the operations.
		expect(upgrade?.endedAt ?? Infinity).toBeLessThanOrEqual(
			query?.startedAt ?? 0,
		);
		const anonymous = spans.find((span) => span.name === 'subscription');
		expect(anonymous?.attributes['graphql.operation.type']).toBe(
			'subscription',
		);
		expect(
			anonymous !== undefined &&
				'graphql.operation.name' in anonymous.attributes,
		).toBe(false);
	});

	test('an operation answered with errors is an error span', async () => {
		const spans = await spansOf([
			{ type: 'mutation', name: 'AddNote', outcome: 'errors' },
		]);
		expect(spans.find((span) => span.name === 'mutation AddNote')?.status).toBe(
			'error',
		);
	});

	test('an upgrade traced leaves out: no span, nor any for its operations', async () => {
		const spans = await spansOf(
			[{ type: 'query', name: 'GetNotes', outcome: 'ok' }],
			false,
		);
		expect(spans).toEqual([]);
	});
});
