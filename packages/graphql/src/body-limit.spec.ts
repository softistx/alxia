import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema } from 'graphql-yoga';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { echo(text: String): String, ping: String }
	`,
	resolvers: {
		Query: {
			echo: (_, args: { text?: string }) => args.text ?? '',
			ping: () => 'pong',
		},
	},
});

const LIMIT = 1024;
const serve = (errors?: 'problem') =>
	graphql(alxia(errors === undefined ? {} : { errors }).bodyLimit(LIMIT), {
		schema,
		logging: false,
		batching: true,
	});
const app = serve();

const query = (text: string) =>
	JSON.stringify({ query: `{ echo(text: "${text}") }` });
const send = (target: { request: typeof app.request }, body: BodyInit) =>
	target.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		duplex: 'half',
	} as RequestInit);

/** `total` bytes of JSON in 256-byte chunks, with no Content-Length. */
function chunked(prefix: string, total: number) {
	const bytes = new TextEncoder().encode(prefix + ' '.repeat(total));
	let at = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (at >= bytes.length) return controller.close();
			controller.enqueue(bytes.subarray(at, at + 256));
			at += 256;
		},
	});
}

describe("graphql(), a body past core's bodyLimit", () => {
	test("a Content-Length past the limit is core's 413", async () => {
		const response = await send(app, query('x'.repeat(2 * LIMIT)));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			error: 'content_too_large',
			limit: LIMIT,
		});
	});

	test('a chunked body, with no Content-Length, is a 413 too', async () => {
		const response = await send(
			app,
			chunked('{"query":"{ ping }"}', 8 * LIMIT),
		);
		expect(response.status).toBe(413);
		expect(await response.text()).not.toContain('originalError');
	});

	test('errors: problem answers application/problem+json', async () => {
		const response = await send(serve('problem'), query('x'.repeat(2 * LIMIT)));
		expect(response.status).toBe(413);
		expect(response.headers.get('content-type')).toContain(
			'application/problem+json',
		);
		const problem = (await response.json()) as {
			status: number;
			limit: number;
		};
		expect(problem.status).toBe(413);
		expect(problem.limit).toBe(LIMIT);
	});

	test('a batch past the limit is a 413', async () => {
		const one = { query: `{ echo(text: "${'x'.repeat(200)}") }` };
		const response = await send(app, JSON.stringify(Array(10).fill(one)));
		expect(response.status).toBe(413);
	});

	test('a body under the limit runs, a batch included', async () => {
		const ok = await send(app, query('hi'));
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ data: { echo: 'hi' } });
		const batch = await send(
			app,
			'[{"query":"{ ping }"},{"query":"{ ping }"}]',
		);
		expect(batch.status).toBe(200);
		expect(await batch.json()).toEqual([
			{ data: { ping: 'pong' } },
			{ data: { ping: 'pong' } },
		]);
	});

	test('a GET is not affected', async () => {
		const response = await app.request('/graphql?query=%7Bping%7D');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { ping: 'pong' } });
	});
});

describe('graphql(), a request Yoga cannot parse', () => {
	test('a body that is not JSON is its 400, with no originalError', async () => {
		const response = await send(app, '{"query": ');
		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toContain('POST body sent invalid JSON.');
		expect(text).not.toContain('originalError');
	});

	test('a client asking for graphql-response+json gets none either', async () => {
		const response = await app.request('/graphql', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/graphql-response+json',
			},
			body: '{"query": ',
		});
		expect(response.status).toBe(400);
		expect(await response.text()).not.toContain('originalError');
	});

	test('variables that are not JSON, in a GET, leak none either', async () => {
		const response = await app.request(
			'/graphql?query=%7Bping%7D&variables=%7Bnope',
		);
		expect(response.ok).toBe(false);
		const text = await response.text();
		expect(text).not.toContain('originalError');
		expect(text).not.toContain('Parse error');
	});
});
