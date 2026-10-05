/**
 * The GraphQL operation on the server span, by OpenTelemetry's conventions:
 * named `query GetNotes`, `graphql.operation.name` and
 * `graphql.operation.type`; a batch named `batch <names>` without a type;
 * `http.route` kept. The endpoint here is a route that reports.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, type OperationReport, reportOperation } from '@alxia/core';
import {
	createTelemetry,
	type Exporter,
	type Signal,
	type SpanRecord,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

/** The span of a `POST /graphql` that reports `operations`. */
async function spanOf(...operations: OperationReport[]): Promise<SpanRecord> {
	const signals: Signal[] = [];
	const exporter: Exporter = {
		export(_resource, batch) {
			signals.push(...batch);
		},
	};
	const instance = createTelemetry('alxia-test', {
		exporters: [exporter],
		batch: 1,
	});
	const app = alxia()
		.use(telemetry({ instance }))
		.post('/graphql', (ctx) => {
			for (const operation of operations) reportOperation(ctx, operation);
			return ctx.reply(200);
		});
	await app.request('/graphql', { method: 'POST' });
	await instance.close();
	return signals.find((signal) => signal.type === 'span') as SpanRecord;
}

describe('telemetry and the GraphQL operation', () => {
	test('a named operation renames the span and sets both attributes', async () => {
		const span = await spanOf({ type: 'query', name: 'GetNotes' });
		expect(span.name).toBe('query GetNotes');
		expect(span.attributes['graphql.operation.name']).toBe('GetNotes');
		expect(span.attributes['graphql.operation.type']).toBe('query');
		expect(span.attributes['http.route']).toBe('/graphql');
	});

	test('an anonymous operation is named by its type alone', async () => {
		const span = await spanOf({ type: 'mutation' });
		expect(span.name).toBe('mutation');
		expect(span.attributes['graphql.operation.type']).toBe('mutation');
		expect('graphql.operation.name' in span.attributes).toBe(false);
	});

	test('a batch lists the names and has no type', async () => {
		const span = await spanOf(
			{ type: 'query', name: 'GetNotes' },
			{ type: 'mutation', name: 'AddNote' },
		);
		expect(span.name).toBe('batch GetNotes,AddNote');
		expect(span.attributes['graphql.operation.name']).toBe('GetNotes,AddNote');
		expect('graphql.operation.type' in span.attributes).toBe(false);
	});

	test('no operation reported: the route name, as before', async () => {
		const span = await spanOf();
		expect(span.name).toBe('POST /graphql');
		expect('graphql.operation.type' in span.attributes).toBe(false);
	});
});
