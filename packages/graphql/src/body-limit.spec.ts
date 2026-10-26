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

/** A Yoga plugin whose `onResponse` marks every answer uncacheable. */
const noStore = {
	onResponse: ({ response }: { response: Response }) => {
		response.headers.set('cache-control', 'no-store');
	},
};

/** A logger that records what Yoga printed, by level. */
function spyLogger() {
	const calls: Record<string, unknown[][]> = {
		debug: [],
		info: [],
		warn: [],
		error: [],
	};
	const logger = {
		debug: (...a: unknown[]) => calls['debug']?.push(a),
		info: (...a: unknown[]) => calls['info']?.push(a),
		warn: (...a: unknown[]) => calls['warn']?.push(a),
		error: (...a: unknown[]) => calls['error']?.push(a),
	};
	return { logger, calls };
}

describe('graphql(), the headers of a 413', () => {
	const marked = (errors?: 'problem') =>
		graphql(alxia(errors === undefined ? {} : { errors }).bodyLimit(LIMIT), {
			schema,
			logging: false,
			plugins: [noStore],
		});

	test('keep what a Yoga plugin set, with a Content-Length past the limit', async () => {
		const response = await send(marked(), query('x'.repeat(2 * LIMIT)));
		expect(response.status).toBe(413);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			error: 'content_too_large',
			limit: LIMIT,
		});
	});

	test('keep it on a chunked body too', async () => {
		const response = await send(
			marked(),
			chunked('{"query":"{ ping }"}', 8 * LIMIT),
		);
		expect(response.status).toBe(413);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	test("the body and content-type stay core's, problem+json included", async () => {
		const response = await send(
			marked('problem'),
			query('x'.repeat(2 * LIMIT)),
		);
		expect(response.status).toBe(413);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-type')).toContain(
			'application/problem+json',
		);
	});

	test.each(['application/x-www-form-urlencoded', 'application/graphql'])(
		"%s past the limit is core's 413 and logs nothing",
		async (type) => {
			const { logger, calls } = spyLogger();
			const target = graphql(alxia().bodyLimit(LIMIT), {
				schema,
				logging: logger,
				plugins: [noStore],
			});
			const response = await target.request('/graphql', {
				method: 'POST',
				headers: { 'content-type': type },
				body: `query=${'x'.repeat(4 * LIMIT)}`,
				duplex: 'half',
			} as RequestInit);
			expect(response.status).toBe(413);
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(await response.json()).toEqual({
				error: 'content_too_large',
				limit: LIMIT,
			});
			expect(calls['error']).toEqual([]);
		},
	);

	test('a chunked form body logs nothing either', async () => {
		const { logger, calls } = spyLogger();
		const target = graphql(alxia().bodyLimit(LIMIT), {
			schema,
			logging: logger,
		});
		const response = await target.request('/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: chunked('query=', 8 * LIMIT),
			duplex: 'half',
		} as RequestInit);
		expect(response.status).toBe(413);
		expect(calls['error']).toEqual([]);
	});
});

describe('graphql(), the bodyLimit option', () => {
	const MIB = 1_048_576;
	const blank = (bytes: number) =>
		JSON.stringify({ query: `{ ping }${' '.repeat(bytes)}` });

	test('no bodyLimit() and no option: 1 MiB, one byte more is a 413', async () => {
		const target = graphql(alxia(), { schema, logging: false });
		const over = blank(MIB);
		expect(new TextEncoder().encode(over).length).toBeGreaterThan(MIB);
		const refused = await send(target, over);
		expect(refused.status).toBe(413);
		expect(await refused.json()).toEqual({
			error: 'content_too_large',
			limit: MIB,
		});
		expect((await send(target, blank(1024))).status).toBe(200);
	});

	test('a bodyLimit() declared before graphql() is kept, not overridden', async () => {
		const small = graphql(alxia().bodyLimit(LIMIT), {
			schema,
			logging: false,
		});
		expect((await send(small, blank(2 * LIMIT))).status).toBe(413);
		const large = graphql(alxia().bodyLimit(4 * MIB), {
			schema,
			logging: false,
		});
		expect((await send(large, blank(2 * MIB))).status).toBe(200);
	});

	test('the option wins over an earlier bodyLimit()', async () => {
		const target = graphql(alxia().bodyLimit(4 * MIB), {
			schema,
			logging: false,
			bodyLimit: LIMIT,
		});
		const refused = await send(target, blank(2 * LIMIT));
		expect(refused.status).toBe(413);
		expect(await refused.json()).toEqual({
			error: 'content_too_large',
			limit: LIMIT,
		});
	});

	test('the option raises the default for uploads', async () => {
		const target = graphql(alxia(), {
			schema,
			logging: false,
			bodyLimit: 4 * MIB,
		});
		expect((await send(target, blank(2 * MIB))).status).toBe(200);
	});

	test("an invalid option throws at declaration, in core's words", () => {
		for (const bad of [-1, 1.5, Number.NaN]) {
			expect(() =>
				graphql(alxia(), { schema, logging: false, bodyLimit: bad }),
			).toThrow(/bodyLimit must be a whole number of bytes/);
		}
	});

	test("a plugin app under a prefix keeps its own limit, not the outer app's", async () => {
		const inner = graphql(alxia().bodyLimit(LIMIT), {
			schema,
			logging: false,
		});
		const outer = alxia()
			.bodyLimit(4 * MIB)
			.plugin(inner);
		expect((await send(outer, blank(2 * LIMIT))).status).toBe(413);
		const bare = graphql(alxia(), { schema, logging: false });
		const mounted = alxia().bodyLimit(LIMIT).plugin(bare);
		expect((await send(mounted, blank(2 * LIMIT))).status).toBe(200);
	});
});
