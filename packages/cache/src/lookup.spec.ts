import { describe, expect, test } from 'bun:test';
import { bypasses, freshness } from './lookup';
import type { CachedResponse } from './store';

describe('bypasses', () => {
	test('only a GET or HEAD is answered by the cache', () => {
		expect(bypasses(new Request('http://x/'), false)).toBe(false);
		expect(bypasses(new Request('http://x/', { method: 'HEAD' }), false)).toBe(
			false,
		);
		expect(bypasses(new Request('http://x/', { method: 'POST' }), false)).toBe(
			true,
		);
	});

	test('a client no-cache skips it only when honored', () => {
		const noCache = new Request('http://x/', {
			headers: { 'cache-control': 'no-cache' },
		});
		expect(bypasses(noCache, false)).toBe(false);
		expect(bypasses(noCache, true)).toBe(true);
	});
});

describe('freshness', () => {
	const kept = (storedAt: number): CachedResponse => ({
		status: 200,
		headers: [],
		body: new Uint8Array(),
		storedAt,
		ttl: 1000,
		stale: 500,
		tags: [],
	});

	test('fresh within its ttl, stale within the window after, nothing beyond', () => {
		expect(freshness(kept(0), 999)).toBe('fresh');
		expect(freshness(kept(0), 1000)).toBe('stale');
		expect(freshness(kept(0), 1499)).toBe('stale');
		expect(freshness(kept(0), 1500)).toBeUndefined();
	});
});
