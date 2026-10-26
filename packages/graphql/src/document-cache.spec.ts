import { describe, expect, test } from 'bun:test';
import { parse } from 'graphql';
import { boundedCache, documentWeight, errorWeight } from './document-cache';

function make(
	overrides: Partial<Parameters<typeof boundedCache<string>>[0]> = {},
) {
	let time = 0;
	const cache = boundedCache<string>({
		max: 100,
		ttl: 1000,
		maxBytes: 800,
		weigh: (_key, value) => value.length,
		now: () => time,
		...overrides,
	});
	return {
		cache,
		tick: (ms: number) => {
			time += ms;
		},
	};
}

describe('boundedCache', () => {
	test('evicts the least recently used entry when maxBytes is passed', () => {
		const { cache } = make();
		for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
			cache.set(key, 'x'.repeat(100));
		}
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeDefined();
		expect(cache.get('i')).toBeDefined();
	});

	test('get refreshes recency', () => {
		const { cache } = make();
		for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
			cache.set(key, 'x'.repeat(100));
		}
		cache.get('a');
		cache.set('i', 'x'.repeat(100));
		expect(cache.get('a')).toBeDefined();
		expect(cache.get('b')).toBeUndefined();
	});

	test('evicts by max entries', () => {
		const { cache } = make({ max: 2 });
		cache.set('a', 'x');
		cache.set('b', 'x');
		cache.set('c', 'x');
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeDefined();
		expect(cache.get('c')).toBeDefined();
	});

	test('expires on ttl', () => {
		const { cache, tick } = make();
		cache.set('a', 'x');
		tick(999);
		expect(cache.get('a')).toBe('x');
		tick(1);
		expect(cache.get('a')).toBeUndefined();
	});

	test('an entry over maxBytes / 8 is not stored and evicts nothing', () => {
		const { cache } = make();
		cache.set('small', 'x'.repeat(100));
		cache.set('big', 'x'.repeat(101));
		expect(cache.get('big')).toBeUndefined();
		expect(cache.get('small')).toBeDefined();
	});

	test('setting a key again replaces its weight', () => {
		const { cache } = make();
		for (let i = 0; i < 20; i++) cache.set('a', 'x'.repeat(100));
		cache.set('b', 'x'.repeat(100));
		expect(cache.get('a')).toBeDefined();
		expect(cache.get('b')).toBeDefined();
	});
});

describe('weights', () => {
	test('a document weighs 512 bytes a token plus twice its source', () => {
		const source = '{ ping }';
		const document = parse(source);
		const tokens = (document as { tokenCount?: number }).tokenCount ?? 0;
		expect(tokens).toBeGreaterThan(0);
		expect(documentWeight(source, document)).toBe(
			512 * tokens + 2 * source.length,
		);
	});

	test('without tokenCount the source length stands in', () => {
		const source = '{ ping }';
		const document = { ...parse(source), tokenCount: undefined };
		expect(documentWeight(source, document as never)).toBe(256 * source.length);
	});

	test('an error weighs twice its source plus 1 024', () => {
		expect(errorWeight('abc')).toBe(2 * 3 + 1024);
	});
});
