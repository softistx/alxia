/**
 * The operations of a socket on the log: one line each, once it ended,
 * with the upgrade's request id, its type, name, duration and outcome; the
 * upgrade's own line as before; none for a socket `skip` leaves out. The
 * socket here is a route that reports with core's `startOperation`.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	alxia,
	type OperationOutcome,
	type OperationReport,
	startOperation,
} from '@alxia/core';
import { type LogEntry, type LoggerOptions, logger } from './logger';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
	await stop?.();
	stop = undefined;
});

type Operation = OperationReport & { readonly outcome: OperationOutcome };

/** The lines of a socket that runs each of `operations`, one per message. */
async function linesOf(
	operations: Operation[],
	options: LoggerOptions = {},
): Promise<LogEntry[]> {
	const lines: LogEntry[] = [];
	const app = alxia()
		.use(logger({ ...options, write: (entry) => lines.push(entry) }))
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
	return lines;
}

describe('logger and the operations of a socket', () => {
	test('one line per operation, with the upgrade id, timed, after the upgrade line', async () => {
		const [upgrade, query, subscription] = await linesOf([
			{ type: 'query', name: 'GetNotes', outcome: 'ok' },
			{ type: 'subscription', outcome: 'ok' },
		]);
		expect(upgrade?.message).toBe('GET /socket 200');
		expect(query).toMatchObject({
			level: 'info',
			requestId: upgrade?.requestId,
			message: 'query GetNotes',
			method: 'GET',
			path: '/socket',
			outcome: 'ok',
			operationName: 'GetNotes',
			operationType: 'query',
		});
		expect(query?.duration).toBeGreaterThanOrEqual(4);
		expect(query?.ip).toBe(upgrade?.ip as string);
		expect(subscription?.message).toBe('subscription');
		expect(subscription !== undefined && 'operationName' in subscription).toBe(
			false,
		);
	});

	test('an operation answered with errors is a warning, marked so', async () => {
		const [, failed] = await linesOf([
			{ type: 'mutation', name: 'AddNote', outcome: 'errors' },
		]);
		expect(failed).toMatchObject({
			level: 'warn',
			message: 'mutation AddNote errors',
			outcome: 'errors',
		});
	});

	test('a socket that skip leaves out: no line for it, nor its operations', async () => {
		const lines = await linesOf(
			[{ type: 'query', name: 'GetNotes', outcome: 'ok' }],
			{ skip: (_, url) => url.pathname === '/socket' },
		);
		expect(lines).toEqual([]);
	});
});
