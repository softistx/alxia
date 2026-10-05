/**
 * Beside the operations of a socket: with the logger alone, lines and no
 * span; with neither observer, nothing told and the operations run all the
 * same; the HTTP endpoint logged and traced as before.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	NOTES,
	operationLines,
	run,
	serve,
	stopServer,
} from '../test/ws-observed/harness';

afterEach(stopServer);

describe('the observers, absent or over HTTP', () => {
	test('with the logger alone, lines and no span; with neither, the operations run all the same', async () => {
		const logged = serve({ logger: true });
		expect(await run(logged.client, NOTES)).toBe(false);
		await logged.client.dispose();
		expect(await logged.flushed()).toEqual([]);
		expect(operationLines(logged.lines)).toHaveLength(1);
		await stopServer();

		const traced = serve({ telemetry: true });
		expect(await run(traced.client, NOTES)).toBe(false);
		await traced.client.dispose();
		expect((await traced.flushed()).map((span) => span.name)).toEqual([
			'GET /graphql',
			'query GetNotes',
		]);
		await stopServer();

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
