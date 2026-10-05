import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from './rate-limit';
import { MemoryStore, type PolicyStore } from './store';

/** A memory store that declares the policy it counts by, as a wired limit does. */
function withPolicy(limit: number, windowMs: number): PolicyStore {
	const memory = new MemoryStore();
	return {
		policy: { limit, windowMs },
		consume: (key) => memory.consume(key, { limit, windowMs }),
		reset: (key) => memory.reset(key),
	};
}

describe('a store with a policy', () => {
	test('gives rateLimit its limit, window and headers', async () => {
		const app = alxia({ ip: () => '1.1.1.1' })
			.use(rateLimit({ store: withPolicy(2, 30_000) }))
			.get('/', ({ rateLimit: info, reply }) => reply(200, info?.limit ?? 0));
		const first = await app.request('/');
		expect(await first.json()).toBe(2);
		expect(first.headers.get('ratelimit-limit')).toBe('2');
		expect(first.headers.get('ratelimit-remaining')).toBe('1');
		expect(first.headers.get('ratelimit-policy')).toBe('2;w=30');
		await app.request('/');
		expect((await app.request('/')).status).toBe(429);
	});

	test('accepts numbers that equal it, whole or in part', () => {
		const store = withPolicy(5, 1_000);
		expect(() => rateLimit({ limit: 5, windowMs: 1_000, store })).not.toThrow();
		expect(() => rateLimit({ limit: 5, store })).not.toThrow();
		expect(() => rateLimit({ windowMs: 1_000, store })).not.toThrow();
	});

	test('numbers that differ are an error at declaration', () => {
		const store = withPolicy(5, 1_000);
		expect(() => rateLimit({ limit: 6, windowMs: 1_000, store })).toThrow(
			"rateLimit: limit 6 differs from the store's policy of 5 per 1000ms",
		);
		expect(() => rateLimit({ windowMs: 2_000, store })).toThrow(
			"rateLimit: windowMs 2000 differs from the store's policy of 5 per 1000ms",
		);
	});

	test('a policy that cannot work is refused', () => {
		expect(() => rateLimit({ store: withPolicy(0, 1_000) })).toThrow(
			'rateLimit: limit must be a whole number of 1 or more, not 0',
		);
	});
});

describe('the types', () => {
	test('limit and windowMs are required without a policy, optional with one', () => {
		const _types = () => {
			rateLimit({ store: withPolicy(1, 1_000) });
			rateLimit({ limit: 1, windowMs: 1_000, store: new MemoryStore() });
			rateLimit({ limit: 1, windowMs: 1_000 });
			// @ts-expect-error a memory store has no policy: limit and windowMs are required
			rateLimit({ store: new MemoryStore() });
			// @ts-expect-error no store at all: limit and windowMs are required
			rateLimit({});
			// @ts-expect-error windowMs is required without a policy
			rateLimit({ limit: 1 });
		};
		expect(_types).toBeFunction();
	});
});
