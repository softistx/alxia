import { describe, expect, expectTypeOf, spyOn, test } from 'bun:test';
import { cache } from '@alxia/cache';
import { alxia, health } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { defineCache, defineRedis, openRedis } from '@nxgt/redis';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { redisCacheStore } from './cache-store';
import { redisCheck } from './check';
import { redis } from './context';
import { idempotency } from './idempotency';
import { redisStore } from './store';

const db = useRedis();

const User = z.object({ id: z.string(), name: z.string() });
const users = defineCache({
	name: 'user',
	key: (id: string) => id,
	ttl: 60,
	schema: User,
});

const open = () =>
	openRedis(defineRedis({ uri: db.uri, prefix: 'shop', caches: { users } }));

const keys = async () =>
	((await db.client.send('KEYS', ['*'])) as string[]).sort();

describe('redis(handle)', () => {
	test('caches typed from the handle, the prefix on every key and lock', async () => {
		const handle = await open();
		const app = alxia()
			.plugin(redis(handle, { close: false }))
			.get('/users/:id', async ({ caches, lock, params, prefix, reply }) => {
				const user = await caches.users.remember(params.id, () => ({
					id: params.id,
					name: 'Ada',
				}));
				expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>();
				const seen = await lock('refresh', async () =>
					(await keys()).filter((key) => key.startsWith('lock:')),
				);
				return reply(200, { user, prefix, seen });
			});
		const body = await (await app.request('/users/1')).json();
		expect(body).toEqual({
			user: { id: '1', name: 'Ada' },
			prefix: 'shop',
			seen: ['lock:shop:refresh'],
		});
		expect(await keys()).toEqual(['shop:user:1']);
		await handle.close();
	});

	test('a handle of several instances is refused, naming them', async () => {
		const handle = await openRedis(
			defineRedis({
				instances: {
					cache: { uri: db.uri, caches: { users } },
					queue: { uri: db.uri, caches: { users } },
				},
			}),
		);
		expect(() => redis(handle)).toThrow(
			/2 Redis instances \("cache", "queue"\)/,
		);
		await handle.close();
	});

	test('the handle is closed once, in onStop, after the drain', async () => {
		const handle = await open();
		const order: string[] = [];
		const close = handle.close.bind(handle);
		const spy = spyOn(handle, 'close').mockImplementation(async () => {
			order.push('close');
			await close();
		});
		const app = alxia()
			.plugin(redis(handle))
			.get('/slow', async ({ reply }) => {
				await Bun.sleep(200);
				order.push('answered');
				return reply(200, 'done');
			});
		const server = app.listen({ port: 0, signals: false });
		const slow = fetch(`${server.url.href}slow`).then((r) => r.text());
		await Bun.sleep(50);
		const stopped = app.stop();
		expect(await slow).toBe('done');
		await stopped;
		await app.stop();
		expect(order).toEqual(['answered', 'close']);
		expect(spy).toHaveBeenCalledTimes(1);
		expect((await handle.ping()).default.ok).toBe(false);
	});

	test('{ close: false } leaves the handle open', async () => {
		const handle = await open();
		const app = alxia().plugin(redis(handle, { close: false }));
		app.listen({ port: 0, signals: false });
		await app.stop();
		expect((await handle.ping()).default.ok).toBe(true);
		await handle.close();
	});
});

describe('the handle in the stores, the guard and the check', () => {
	test('every key of the deployment shares the handle prefix', async () => {
		const handle = await open();
		let runs = 0;
		const app = alxia({ ip: () => '1.2.3.4' })
			.use(
				rateLimit({
					limit: 5,
					windowMs: 60_000,
					store: redisStore(handle, { name: 'api' }),
				}),
			)
			.use(
				cache({
					ttl: 60,
					store: redisCacheStore(handle, { name: 'pages' }),
					tags: () => ['pages'],
				}),
			)
			.use(idempotency(handle, { name: 'orders' }))
			.plugin(redis(handle, { close: false }))
			.get('/page', ({ reply }) => reply(200, { runs: ++runs }))
			.post('/orders', async ({ caches, lock, reply }) => {
				await caches.users.set('9', { id: '9', name: 'Zed' });
				await lock('order', () => 'x');
				return reply(201, { runs: ++runs });
			});
		await app.request('/page');
		await app.request('/orders', {
			method: 'POST',
			headers: { 'idempotency-key': 'k1' },
		});
		const all = await keys();
		expect(all.length).toBeGreaterThanOrEqual(5);
		for (const key of all) expect(key.startsWith('shop:')).toBe(true);
		const kinds = all.map((key) => key.split(':')[1]);
		expect(new Set(kinds)).toEqual(new Set(['api', 'pages', 'orders', 'user']));
		// A repeat is still replayed, and a hit still served, under the prefix.
		const replay = await app.request('/orders', {
			method: 'POST',
			headers: { 'idempotency-key': 'k1' },
		});
		expect(replay.headers.get('idempotent-replayed')).toBe('true');
		expect((await app.request('/page')).headers.get('x-cache')).toBe('HIT');
		await handle.close();
	});

	test('without a prefix the keys are the bare ones', async () => {
		const handle = await openRedis(
			defineRedis({ uri: db.uri, caches: { users } }),
		);
		const store = redisStore(handle, { name: 'plain' });
		await store.consume('k', { limit: 1, windowMs: 60_000 });
		expect((await keys()).every((key) => key.startsWith('plain:'))).toBe(true);
		await handle.close();
	});

	test('redisCheck is up while Redis answers and down once the handle is closed', async () => {
		const handle = await open();
		const check = redisCheck(handle);
		expect(await check()).toBe(true);
		const app = alxia().plugin(health({ checks: { redis: check } }));
		expect((await app.request('/ready')).status).toBe(200);
		await handle.close();
		expect(await check()).toBe(false);
		expect(
			(
				await alxia()
					.plugin(health({ checks: { redis: check }, cache: 0 }))
					.request('/ready')
			).status,
		).toBe(503);
	});

	test('redisCheck on a bare client pings it', async () => {
		expect(await redisCheck(db.client)()).toBe(true);
	});
});
