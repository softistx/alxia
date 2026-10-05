import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import {
	bindRateLimit,
	defineRateLimit,
	defineRedis,
	openRedis,
} from '@nxgt/redis';
import { useRedis } from '../test/server';
import { redisStore } from './store';

const db = useRedis();

const api = defineRateLimit({
	name: 'api',
	key: (ip: string) => ip,
	limit: 3,
	per: 30_000,
});
const slower = defineRateLimit({
	name: 'api',
	key: (ip: string) => ip,
	limit: 3,
	per: 60_000,
});
const renamed = defineRateLimit({
	name: 'renamed',
	key: (ip: string) => ip,
	limit: 3,
	per: 30_000,
});

const open = () =>
	openRedis(defineRedis({ uri: db.uri, prefix: 'shop', limits: { api } }));

describe('redisStore(handle.limits.api)', () => {
	test('the definition is the one place: headers and 429 come from it', async () => {
		await using handle = await open();
		const store = redisStore(handle.limits.api);
		expect(store.policy).toEqual({ limit: 3, windowMs: 30_000 });
		const app = alxia({ ip: () => '1.2.3.4' })
			.use(rateLimit({ store }))
			.get('/', ({ rateLimit: info, reply }) => reply(200, info?.limit ?? 0));
		const first = await app.request('/');
		expect(await first.json()).toBe(3);
		expect(first.headers.get('ratelimit-limit')).toBe('3');
		expect(first.headers.get('ratelimit-remaining')).toBe('2');
		expect(first.headers.get('ratelimit-policy')).toBe('3;w=30');
		const reset = Number(first.headers.get('ratelimit-reset'));
		expect(reset).toBeGreaterThan(0);
		expect(reset).toBeLessThanOrEqual(10);
		await app.request('/');
		await app.request('/');
		const refused = await app.request('/');
		expect(refused.status).toBe(429);
		expect(refused.headers.get('ratelimit-remaining')).toBe('0');
		expect(await db.client.send('EXISTS', ['shop:api:1.2.3.4'])).toBe(1);
	});

	test('numbers that differ from the definition throw at declaration', async () => {
		await using handle = await open();
		const store = redisStore(handle.limits.api);
		expect(() => rateLimit({ limit: 100, windowMs: 30_000, store })).toThrow(
			"rateLimit: limit 100 differs from the store's policy of 3 per 30000ms",
		);
		expect(() =>
			rateLimit({ limit: 3, windowMs: 30_000, store }),
		).not.toThrow();
	});

	test('a limit bound by hand carries its definition too', async () => {
		const store = redisStore(bindRateLimit(db.client, api));
		expect(store.policy).toEqual({ limit: 3, windowMs: 30_000 });
	});

	test('the deprecated two-argument form still works, wired under a prefix', async () => {
		await using handle = await open();
		const store = redisStore(handle.limits.api, api);
		expect(store.policy).toEqual({ limit: 3, windowMs: 30_000 });
		// A rename is no mismatch: the rate is what is compared.
		expect(redisStore(handle.limits.api, renamed).policy).toEqual(store.policy);
	});

	test('a definition of another rate than the limit counts by is refused', async () => {
		await using handle = await open();
		expect(() => redisStore(handle.limits.api, slower)).toThrow(
			'redisStore: the definition "api" (3 per 60000ms) is not the rate this limit counts by (3 per 30000ms)',
		);
	});

	test('types: the store needs no limit, a client form still does', async () => {
		await using handle = await open();
		const _types = () => {
			rateLimit({ store: redisStore(handle.limits.api) });
			rateLimit({ store: redisStore(handle.limits.api, api) });
			// @ts-expect-error a store counted by name has no policy
			rateLimit({ store: redisStore(db.client, { name: 'x' }) });
		};
		expect(_types).toBeFunction();
	});
});
