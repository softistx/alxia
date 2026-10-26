/**
 * `maxNesting`: graphql-js parses by recursion and overflows the stack a few
 * thousand levels down, under `maxTokens`. A document nested past the limit
 * is refused as any document it cannot parse is (`GRAPHQL_PARSE_FAILED`),
 * over POST, GET and a batch, never logged and never a 500.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema, type Plugin } from 'graphql-yoga';
import { type GraphQLOptions, graphql } from './graphql';
import { DEFAULT_MAX_NESTING, nestingLimit, tooDeepAt } from './nesting';

const schema = createSchema({
	typeDefs: /* GraphQL */ 'type Query { ping: String, a: Query }',
	resolvers: { Query: { ping: () => 'pong', a: () => ({}) } },
});

/** `{ a { a { … ping } } }`, `depth` levels of braces. */
const nested = (depth: number) =>
	`${'{ a '.repeat(depth - 1)}{ ping ${'}'.repeat(depth)}`;

/** The same, unclosed: the parser recurses to the end of the source. */
const unclosed = (depth: number) => '{ a '.repeat(depth);

function serve(
	options: Partial<GraphQLOptions<never, never, '/graphql'>> = {},
) {
	const errors: unknown[][] = [];
	const app = graphql(alxia(), {
		schema,
		ide: false,
		logging: {
			debug() {},
			info() {},
			warn() {},
			error: (...args: unknown[]) => void errors.push(args),
		},
		batching: true,
		...options,
	} as never);
	return { app, errors };
}

const post = (app: ReturnType<typeof serve>['app'], body: unknown) =>
	app.request('/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/graphql-response+json',
		},
		body: JSON.stringify(body),
	});

interface Answer {
	data?: unknown;
	errors?: { message: string; extensions: { code: string } }[];
}

describe('graphql({ maxNesting })', () => {
	test('9 000 levels, under maxTokens, are a 400 parse failure, nothing logged', async () => {
		const { app, errors } = serve();
		const query = nested(9000);
		expect(query.length).toBeGreaterThan(36_000);
		const refused = await post(app, { query });
		expect(refused.status).toBe(400);
		const body = (await refused.json()) as Answer;
		expect(body.data).toBeUndefined();
		expect(body.errors?.[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
		expect(body.errors?.[0]?.message).toBe(
			'Syntax Error: Document is nested more than 1000 levels deep. Parsing aborted.',
		);
		expect(errors).toEqual([]);
	});

	test('an unclosed document is refused the same way', async () => {
		const { app, errors } = serve();
		const refused = await post(app, { query: unclosed(7000) });
		expect(refused.status).toBe(400);
		expect(((await refused.json()) as Answer).errors?.[0]?.message).toMatch(
			/nested more than 1000 levels/,
		);
		expect(errors).toEqual([]);
	});

	test('1 000 levels run, 1 001 are refused', async () => {
		expect(DEFAULT_MAX_NESTING).toBe(1000);
		const { app, errors } = serve();
		const ran = await post(app, { query: nested(1000) });
		expect(ran.status).toBe(200);
		expect(((await ran.json()) as Answer).errors).toBeUndefined();
		const refused = await post(app, { query: nested(1001) });
		expect(refused.status).toBe(400);
		expect(errors).toEqual([]);
	});

	test('a GET ?query= is refused the same way', async () => {
		const { app, errors } = serve();
		const response = await app.request(
			`/graphql?query=${encodeURIComponent(nested(9000))}`,
			{ headers: { accept: 'application/graphql-response+json' } },
		);
		expect(response.status).toBe(400);
		expect(
			((await response.json()) as Answer).errors?.[0]?.extensions.code,
		).toBe('GRAPHQL_PARSE_FAILED');
		expect(errors).toEqual([]);
	});

	test('in a batch only the too-deep operation fails', async () => {
		const { app, errors } = serve();
		const response = await app.request('/graphql', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json',
			},
			body: JSON.stringify([{ query: '{ ping }' }, { query: nested(9000) }]),
		});
		expect(response.status).toBe(200);
		const [first, second] = (await response.json()) as [Answer, Answer];
		expect(first.data).toEqual({ ping: 'pong' });
		expect(second.errors?.[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
		expect(errors).toEqual([]);
	});

	test('maxNesting caps at the number given', async () => {
		const { app } = serve({ maxNesting: 5 });
		expect((await post(app, { query: nested(5) })).status).toBe(200);
		expect((await post(app, { query: nested(6) })).status).toBe(400);
	});

	test('maxNesting: false turns the scan off', async () => {
		const { app, errors } = serve({ maxNesting: false });
		expect((await post(app, { query: nested(1001) })).status).toBe(200);
		expect(errors).toEqual([]);
	});

	test('a document that still overflows the stack is a 400, never a 500', async () => {
		const { app, errors } = serve({ maxNesting: false, maxTokens: false });
		const refused = await post(app, { query: unclosed(30_000) });
		expect(refused.status).toBe(400);
		const body = (await refused.json()) as Answer;
		expect(body.errors?.[0]?.extensions.code).toBe('GRAPHQL_PARSE_FAILED');
		expect(body.errors?.[0]?.message).toBe(
			'Syntax Error: Document is nested too deeply to parse.',
		);
		expect(errors).toEqual([]);
	});

	test('brackets in strings, block strings and comments do not count', async () => {
		const { app } = serve({ maxNesting: 3 });
		const text = '{{{{{{{{{{';
		const queries = [
			`{ a(x: "${text}") { ping } }`,
			`{ a(x: """${text} \\""" ${text}""") { ping } }`,
			`{ a { ping } } # ${text}`,
			`{ a(x: "esc \\" ${text}") { ping } }`,
			`# ${text}\n{ ping }`,
		];
		for (const query of queries) {
			const response = await post(app, { query });
			const body = (await response.json()) as Answer;
			expect(body.errors?.[0]?.message ?? '').not.toMatch(/nested/);
		}
	});

	test('a RangeError that is not the call stack is not turned into the nesting error', async () => {
		const failing: Plugin = {
			onParse({ setParseFn }) {
				setParseFn(() => {
					throw new RangeError('Invalid string length');
				});
			},
		};
		const { app } = serve({ plugins: [failing] });
		const response = await post(app, { query: '{ ping }' });
		const text = await response.text();
		expect(text).not.toMatch(/nested/);
		expect(text).not.toMatch(/GRAPHQL_PARSE_FAILED/);
	});

	for (const bad of [0, -1, 1.5, Number.NaN, '10']) {
		test(`maxNesting: ${String(bad)} is refused at declaration`, () => {
			expect(() => serve({ maxNesting: bad as never })).toThrow(
				new TypeError(
					`graphql(app, { maxNesting }): maxNesting is the most levels of { ( [ a document may nest, a positive whole number, or false for none; got ${String(bad)}`,
				),
			);
		});
	}
});

describe('tooDeepAt', () => {
	test('counts { ( [ together and returns the first offending offset', () => {
		expect(tooDeepAt('{ a(b: [1]) }', 3)).toBe(-1);
		expect(tooDeepAt('{ a(b: [1]) }', 2)).toBe(7);
	});

	test('a closed bracket frees its level, a stray closer is ignored', () => {
		expect(tooDeepAt('{a}{a}{a}', 1)).toBe(-1);
		expect(tooDeepAt('}}}{a}', 1)).toBe(-1);
	});

	test('skips strings, block strings and comments, to the end of the line', () => {
		expect(tooDeepAt('"{{{" "\\"{{{" """{{{ \\""" {{{""" # {{{\n{', 1)).toBe(
			-1,
		);
		expect(tooDeepAt('# {{{\r{ {', 1)).toBe(8);
		expect(tooDeepAt('"{{{\n{ {', 1)).toBe(7);
	});

	test('nestingLimit defaults to 1 000', () => {
		expect(nestingLimit(undefined)).toBe(1000);
		expect(nestingLimit(false)).toBe(false);
		expect(nestingLimit(7)).toBe(7);
	});
});

describe('graphql({ maxNesting, ws })', () => {
	let stop: (() => Promise<void>) | undefined;
	afterEach(async () => {
		await stop?.();
		stop = undefined;
	});

	test('a too-deep subscribe is an error message, the socket stays open, nothing is logged', async () => {
		const { errors, logging } = (() => {
			const errors: unknown[][] = [];
			return {
				errors,
				logging: {
					debug() {},
					info() {},
					warn() {},
					error: (...args: unknown[]) => void errors.push(args),
				},
			};
		})();
		const app = graphql(alxia(), {
			schema,
			ide: false,
			ws: true,
			logging,
		} as never);
		const server = app.listen({ port: 0, signals: false });
		stop = () => app.stop(true);
		const url = new URL('/graphql', server.url);
		url.protocol = 'ws:';
		const socket = new WebSocket(url, 'graphql-transport-ws');
		const received: { type: string; id?: string; payload?: unknown }[] = [];
		socket.onmessage = (event) => received.push(JSON.parse(String(event.data)));
		await new Promise((resolve) => {
			socket.onopen = resolve;
		});
		const next = async (type: string) => {
			for (let i = 0; i < 200; i++) {
				const found = received.find((message) => message.type === type);
				if (found !== undefined) return found;
				await Bun.sleep(10);
			}
			throw new Error(`no ${type} message`);
		};
		socket.send(JSON.stringify({ type: 'connection_init' }));
		await next('connection_ack');
		socket.send(
			JSON.stringify({
				id: '1',
				type: 'subscribe',
				payload: { query: nested(9000) },
			}),
		);
		const error = await next('error');
		expect(JSON.stringify(error.payload)).toMatch(/GRAPHQL_PARSE_FAILED/);
		expect(socket.readyState).toBe(WebSocket.OPEN);
		expect(errors).toEqual([]);
		socket.close();
	});
});
