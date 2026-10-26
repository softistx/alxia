/**
 * `parseCache`: the documents Yoga keeps are bounded by their weight, so
 * distinct heavy queries cannot hold gigabytes.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createSchema, type Plugin } from 'graphql-yoga';
import { queryOf } from '../test/queries';
import { graphql } from './graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ 'type Query { ping: String }',
	resolvers: { Query: { ping: () => 'pong' } },
});

const serve = (options: Record<string, unknown> = {}) =>
	graphql(alxia(), { schema, ide: false, logging: false, ...options } as never);

const post = (app: ReturnType<typeof serve>, query: string) =>
	app.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	});

/** A spy on the parse function: it runs only for a document the cache did not give. */
function parses() {
	let count = 0;
	const plugin: Plugin = {
		onParse({ parseFn, setParseFn }) {
			setParseFn((source, options) => {
				count++;
				return parseFn(source, options);
			});
		},
	};
	return { plugin, count: () => count };
}

const heap = () => {
	Bun.gc(true);
	return process.memoryUsage().heapUsed;
};

describe('graphql({ parseCache })', () => {
	test('60 distinct 12 000-token queries do not pile up in the cache', async () => {
		const app = serve({ parseCache: { maxBytes: 8 * 1024 * 1024 } });
		await post(app, '{ ping }');
		const before = heap();
		for (let i = 0; i < 60; i++) {
			// Distinct sources of 12 000 tokens: the alias names differ.
			const body = Array.from({ length: 3999 }, (_, k) => `a${i}x${k}: ping`);
			const response = await post(app, `{ ping ${body.join(' ')} }`);
			expect(response.status).toBe(200);
		}
		expect(heap() - before).toBeLessThan(64 * 1024 * 1024);
	});

	test('a repeated query is parsed once', async () => {
		const spy = parses();
		const app = serve({ plugins: [spy.plugin] });
		await post(app, '{ ping }');
		await post(app, '{ ping }');
		expect(spy.count()).toBe(1);
	});

	test('parseCache: false parses every request', async () => {
		const spy = parses();
		const app = serve({ parseCache: false, plugins: [spy.plugin] });
		await post(app, '{ ping }');
		await post(app, '{ ping }');
		expect(spy.count()).toBe(2);
	});

	test("Yoga's own parserAndValidationCache is used", async () => {
		const stored = new Map<string, unknown>();
		const documentCache = {
			get: (key: string) => stored.get(key) as never,
			set: (key: string, value: unknown) => void stored.set(key, value),
		};
		const app = serve({
			parserAndValidationCache: { documentCache, errorCache: documentCache },
		});
		await post(app, '{ ping }');
		expect([...stored.keys()]).toEqual(['{ ping }']);
	});

	test('a query over a small maxBytes is parsed again, not kept', async () => {
		const spy = parses();
		const app = serve({
			parseCache: { maxBytes: 1024 },
			plugins: [spy.plugin],
		});
		await post(app, queryOf(100));
		await post(app, queryOf(100));
		expect(spy.count()).toBe(2);
	});

	test('both cache options are refused together', () => {
		expect(() =>
			serve({ parseCache: {}, parserAndValidationCache: true }),
		).toThrow(
			new TypeError(
				"graphql(app, { parseCache, parserAndValidationCache }): give one: parseCache sizes alxia's bounded cache, parserAndValidationCache replaces it",
			),
		);
	});

	for (const [name, value] of [
		['maxBytes', 0],
		['max', -1],
		['ttl', 1.5],
	] as const) {
		test(`parseCache.${name}: ${value} is refused at declaration`, () => {
			expect(() => serve({ parseCache: { [name]: value } })).toThrow(
				new RegExp(`graphql\\(app, \\{ parseCache\\.${name} \\}\\)`),
			);
		});
	}
});
