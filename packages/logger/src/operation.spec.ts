/**
 * The GraphQL operation on the request's line: `operationName` and
 * `operationType` when an endpoint reported one (`@alxia/graphql` does),
 * and not a key otherwise. The endpoint here is a route that reports.
 */
import { describe, expect, test } from 'bun:test';
import { alxia, type OperationReport, reportOperation } from '@alxia/core';
import { type LogEntry, logger } from './logger';

/** A `POST /graphql` that reports `operations`, and the line it is logged as. */
async function lineOf(...operations: OperationReport[]): Promise<LogEntry> {
	const entries: LogEntry[] = [];
	const app = alxia()
		.use(logger({ write: (entry) => entries.push(entry) }))
		.post('/graphql', (ctx) => {
			for (const operation of operations) reportOperation(ctx, operation);
			return ctx.reply(200);
		});
	await app.request('/graphql', { method: 'POST' });
	return entries[0] as LogEntry;
}

describe('logger and the GraphQL operation', () => {
	test('a named operation: its name and type on the line', async () => {
		const entry = await lineOf({ type: 'query', name: 'GetNotes' });
		expect(entry.message).toBe('POST /graphql 200');
		expect(entry.operationName).toBe('GetNotes');
		expect(entry.operationType).toBe('query');
	});

	test('an anonymous operation has a type and no name', async () => {
		const entry = await lineOf({ type: 'mutation' });
		expect(entry.operationType).toBe('mutation');
		expect('operationName' in entry).toBe(false);
	});

	test('a batch: type batch, every name', async () => {
		const entry = await lineOf(
			{ type: 'query', name: 'GetNotes' },
			{ type: 'mutation', name: 'AddNote' },
		);
		expect(entry.operationType).toBe('batch');
		expect(entry.operationName).toBe('GetNotes,AddNote');
	});

	test('a request that reported none has neither field', async () => {
		const entry = await lineOf();
		expect('operationName' in entry).toBe(false);
		expect('operationType' in entry).toBe(false);
	});
});
