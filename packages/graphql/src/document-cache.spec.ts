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
	test('a document weighs 512 bytes a token plus 4 per source character', () => {
		const source = '{ ping }';
		const document = parse(source);
		// SOF, `{`, `ping`, `}`, EOF.
		expect(documentWeight(source, document)).toBe(512 * 5 + 4 * 8);
	});

	test('comments are weighed: the whole token chain counts', () => {
		const comments = 2000;
		const source = `${'#\n'.repeat(comments)}{ ping }`;
		const document = parse(source);
		expect((document as { tokenCount?: number }).tokenCount).toBeLessThan(10);
		expect(documentWeight(source, document)).toBeGreaterThanOrEqual(
			512 * comments,
		);
	});

	test('an escaped string adds 32 bytes a source character of its span', () => {
		const plain = '{ ping(t: "ab") }';
		const escaped = '{ ping(t: "a\\n") }';
		const span = 5;
		expect(escaped.length).toBe(plain.length + 1);
		expect(documentWeight(escaped, parse(escaped))).toBe(
			documentWeight(plain, parse(plain)) + 4 + 32 * span,
		);
	});

	test('a raw string and a block string add nothing extra', () => {
		const raw = '{ ping(t: "abc", u: """x""") }';
		expect(documentWeight(raw, parse(raw))).toBe(512 * 13 + 4 * raw.length);
	});

	test('without loc, tokenCount and 36 bytes a character stand in', () => {
		const source = '{ ping }';
		const document = parse(source, { noLocation: true });
		const tokens = (document as { tokenCount?: number }).tokenCount ?? 0;
		expect(tokens).toBeGreaterThan(0);
		expect(documentWeight(source, document)).toBe(
			512 * tokens + 36 * source.length,
		);
	});

	test('without loc or tokenCount the source length stands in', () => {
		const source = '{ ping }';
		const document = {
			...parse(source),
			loc: undefined,
			tokenCount: undefined,
		};
		expect(documentWeight(source, document as never)).toBe(256 * source.length);
	});

	test('an error weighs 4 bytes a character plus 1 024', () => {
		expect(errorWeight('abc')).toBe(4 * 3 + 1024);
	});
});
