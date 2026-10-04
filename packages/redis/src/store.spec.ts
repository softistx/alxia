import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { useRedis } from '../test/server';
import { redisStore } from './store';

const db = useRedis();

describe('redisStore', () => {
	test('two apps sharing a Redis share a count, 429 and all', async () => {
		const make = () =>
			alxia({ ip: () => '1.2.3.4' })
				.plugin(
					rateLimit({
						limit: 2,
						windowMs: 60_000,
						store: redisStore(db.client, { name: 'api' }),
					}),
				)
				.get('/', ({ reply }) => reply(200, 'ok'));
		const [one, two] = [make(), make()];
		expect((await one.request('/')).status).toBe(200);
		expect((await two.request('/')).status).toBe(200);
		const third = await one.request('/');
		expect(third.status).toBe(429);
		expect((await third.json()).retryAfter).toBeGreaterThan(0);
		expect(third.headers.get('ratelimit-remaining')).toBe('0');
	});

	test('reset forgets a key', async () => {
		const store = redisStore(db.client, { name: 'reset' });
		const policy = { limit: 1, windowMs: 60_000 };
		expect((await store.consume('k', policy)).allowed).toBe(true);
		expect((await store.consume('k', policy)).allowed).toBe(false);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
	});

	test('reset forgets a key counted by another store, or another process', async () => {
		const policy = { limit: 1, windowMs: 60_000 };
		const counting = redisStore(db.client, { name: 'shared' });
		expect((await counting.consume('k', policy)).allowed).toBe(true);
		expect((await counting.consume('k', policy)).allowed).toBe(false);
		await redisStore(db.client, { name: 'shared' }).reset('k');
		expect((await counting.consume('k', policy)).allowed).toBe(true);
	});

	test('reset skips what it did not record under the name', async () => {
		const store = redisStore(db.client, { name: 'odd' });
		const policy = { limit: 1, windowMs: 60_000 };
		await store.consume('k', policy);
		await db.client.send('SADD', ['odd:policies', 'a/b', '0/1000', '1/2/3']);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
		expect(
			((await db.client.send('SMEMBERS', ['odd:policies'])) as string[]).sort(),
		).toEqual(['0/1000', '1/2/3', '1/60000', 'a/b']);
	});
});
