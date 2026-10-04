import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { setup } from '../test/app';
import { cache } from './cache';
import { MemoryCacheStore } from './store';

describe('cache: a store that cannot answer', () => {
	test('a store that cannot answer: the route answers, and it is logged', async () => {
		const broken = new MemoryCacheStore();
		broken.get = () => {
			throw new Error('store down');
		};
		broken.set = () => Promise.reject(new Error('store down'));
		const logged: unknown[] = [];
		const original = console.error;
		console.error = (error: unknown) => logged.push(error);
		try {
			const { app, runs } = setup({ store: broken });
			const first = await app.request('/products');
			expect(first.status).toBe(200);
			expect(await first.json()).toEqual({ runs: 1 });
			expect((await app.request('/products')).status).toBe(200);
			expect(runs()).toBe(2);
			expect(logged).toHaveLength(1); // once per outage, not per request
		} finally {
			console.error = original;
		}
	});
});

describe('MemoryCacheStore', () => {
	const entry = (bytes: number, tags: string[] = []) => ({
		status: 200,
		headers: [],
		body: new Uint8Array(bytes),
		storedAt: Date.now(),
		ttl: 1000,
		stale: 0,
		tags,
	});

	test('evicts the least recently read, by count and by bytes', () => {
		const store = new MemoryCacheStore({ maxEntries: 2, maxBytes: 100 });
		store.set('a', entry(10), 1000);
		store.set('b', entry(10), 1000);
		store.get('a');
		store.set('c', entry(10), 1000);
		expect(store.get('b')).toBeUndefined();
		expect(store.get('a')).toBeDefined();
		store.set('d', entry(95), 1000);
		expect(store.size).toBe(1);
	});

	test('expires, and forgets by tag', async () => {
		const store = new MemoryCacheStore();
		store.set('a', entry(1, ['t']), 10);
		store.set('b', entry(1, ['t']), 1000);
		await Bun.sleep(20);
		expect(store.get('a')).toBeUndefined();
		store.deleteTag('t');
		expect(store.get('b')).toBeUndefined();
	});

	test('a request no route matches is never kept', async () => {
		const store = new MemoryCacheStore();
		const app = alxia()
			.use(cache({ ttl: 60, store, statuses: [200, 404] }))
			.get('/here', ({ reply }) => reply(200, 'here'));
		expect((await app.request('/missing')).status).toBe(404);
		expect((await app.request('/missing')).headers.get('x-cache')).toBeNull();
		expect((await app.request('/here')).headers.get('x-cache')).toBe('MISS');
		expect((await app.request('/here')).headers.get('x-cache')).toBe('HIT');
	});
});
